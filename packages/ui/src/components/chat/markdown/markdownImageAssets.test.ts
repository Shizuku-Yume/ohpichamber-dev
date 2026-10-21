import { describe, expect, mock, test } from 'bun:test';

let requestCount = 0;
let requestPaths: string[] = [];
let requestInits: (RequestInit | undefined)[] = [];

const runtimeFetch = mock(async (path: string, init?: RequestInit) => {
  requestCount += 1;
  requestPaths.push(path);
  requestInits.push(init);
  // SAFETY: the test writes this request body itself, so its shape is known here.
  const body = JSON.parse(String(init?.body)) as { sources: string[] };
  return new Response(JSON.stringify({
    // Deliberately out of order: the client must map each result by sourceIndex.
    results: body.sources.map((_source, sourceIndex) => ({
      sourceIndex: body.sources.length - 1 - sourceIndex,
      status: 'ready',
      expiresAt: Date.now() + 600_000,
      assetPath: `/api/openchamber/sessions/ses_1/markdown-image-grants/grant-${body.sources.length - 1 - sourceIndex}/raw`,
    })),
  }), { status: 200, headers: { 'content-type': 'application/json' } });
});
const resolver = {
  api: () => '',
  authenticatedAsset: (path: string, query: Record<string, string | undefined> = {}) => {
    const params = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])));
    return params.size > 0 ? `${path}?${params}` : path;
  },
};

mock.module('@/lib/runtime-fetch', () => ({ runtimeFetch }));
mock.module('@/lib/runtime-url', () => ({ getRuntimeUrlResolver: () => resolver }));
// Load after installing runtime mocks so these tests exercise the grant request boundary.
const {
  getPreparedMarkdownImageUrl,
  prepareLocalMarkdownImages,
} = await import('./markdownImageAssets');

describe('Markdown image asset preparation', () => {
  test('prepares many images in one message-level request', async () => {
    requestCount = 0;
    requestPaths = [];
    requestInits = [];
    const sources = Array.from({ length: 12 }, (_, index) => `${index}.png`);

    const result = await prepareLocalMarkdownImages({
      sources,
      directory: '/repo',
      sessionId: 'ses_batch',
      messageId: 'msg_batch',
      signal: new AbortController().signal,
    });

    expect(result.size).toBe(12);
    expect(requestCount).toBe(1);
    expect(requestPaths).toEqual(['/api/openchamber/sessions/ses_batch/markdown-image-grants']);
    expect(JSON.parse(String(requestInits[0]?.body))).toEqual({
      directory: '/repo',
      messageId: 'msg_batch',
      sources,
    });
  });

  test('reuses preparation for one thousand messages after virtualized remounts', async () => {
    requestCount = 0;
    const requests = Array.from({ length: 1000 }, (_, index) => ({
      sources: [`${index}.png`],
      directory: '/repo',
      sessionId: 'ses_long',
      messageId: `msg_${index}`,
      signal: new AbortController().signal,
    }));

    for (const request of requests) await prepareLocalMarkdownImages(request);
    for (const request of requests) await prepareLocalMarkdownImages(request);

    expect(requestCount).toBe(1000);
  });

  test('uses the server-issued markdown image grant path', () => {
    const url = getPreparedMarkdownImageUrl({
      status: 'ready',
      assetPath: '/api/openchamber/sessions/ses_1/markdown-image-grants/grant-1/raw',
    }, '/repo');

    expect(url).toBe('/api/openchamber/sessions/ses_1/markdown-image-grants/grant-1/raw');
  });

  test('addresses a space grant to the space that issued it', () => {
    const url = getPreparedMarkdownImageUrl({
      status: 'ready',
      assetPath: '/api/openchamber/sessions/ses_1/markdown-image-grants/grant-1/raw',
    }, '/spaces/0123456789ab/project');

    expect(url).toBe('/api/spaces/0123456789ab/openchamber/sessions/ses_1/markdown-image-grants/grant-1/raw');
  });

  test('maps grant results back to their requested source by index', async () => {
    const result = await prepareLocalMarkdownImages({
      sources: ['first.png', 'second.png'],
      directory: '/repo',
      sessionId: 'ses_order',
      messageId: 'msg_order',
      signal: new AbortController().signal,
    });

    expect(result.get('first.png')).toMatchObject({ status: 'ready', assetPath: expect.stringContaining('grant-0') });
    expect(result.get('second.png')).toMatchObject({ status: 'ready', assetPath: expect.stringContaining('grant-1') });
  });

});
