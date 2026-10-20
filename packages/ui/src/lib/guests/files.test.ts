import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { guestFileOperation } from './files';

interface FetcherSpy {
  mockRestore(): void;
}

let fetcher: FetcherSpy | undefined;

beforeEach(() => {
  switchRuntimeEndpoint({ apiBaseUrl: 'https://guest-files.test', runtimeKey: `guest-files-${crypto.randomUUID()}` });
});

afterEach(() => {
  fetcher?.mockRestore();
  fetcher = undefined;
});

const respond = (response: Response): { request: () => Request } => {
  let seen: Request | undefined;
  fetcher = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    seen = new Request(input, init);
    return response;
  });
  return {
    request: () => {
      if (!seen) throw new Error('The guest file request was not sent');
      return seen;
    },
  };
};

describe('guest file operation directory scope', () => {
  test('sends the open project as the directory query and never an engine header', async () => {
    const sent = respond(Response.json({ ok: true, result: { content: 'hello' } }));

    await expect(guestFileOperation('guest-a', { op: 'read', path: 'README.md' }, '/project'))
      .resolves.toEqual({ ok: true, result: { content: 'hello' } });

    const request = sent.request();
    const url = new URL(request.url);
    expect(url.pathname).toBe('/api/guests/guest-a/files');
    expect(url.searchParams.get('directory')).toBe('/project');
    expect(request.headers.has('x-opencode-directory')).toBe(false);
    expect(request.method).toBe('POST');
    expect(await request.json()).toEqual({ op: 'read', path: 'README.md' });
  });

  test('omits the directory query when no project is open', async () => {
    const sent = respond(Response.json({ ok: true, result: { kind: 'file', size: 0, mtime: 0 } }));

    await expect(guestFileOperation('guest-a', { op: 'stat', path: '/tmp/notes.txt' }, null))
      .resolves.toEqual({ ok: true, result: { kind: 'file', size: 0, mtime: 0 } });

    const request = sent.request();
    const url = new URL(request.url);
    expect(url.pathname).toBe('/api/guests/guest-a/files');
    expect(url.searchParams.has('directory')).toBe(false);
    expect(request.headers.has('x-opencode-directory')).toBe(false);
  });

  test('keeps a refused operation observable instead of inventing success', async () => {
    respond(Response.json({ error: 'NOT_GRANTED', message: 'Files grant required' }, { status: 400 }));

    await expect(guestFileOperation('guest-a', { op: 'list', path: '.' }, '/project'))
      .resolves.toEqual({ ok: false, code: 'NOT_GRANTED', message: 'Files grant required' });
  });
});
