import { afterEach, describe, expect, spyOn, test } from 'bun:test';
<<<<<<< HEAD
import { fetchSessionKnowledgeSummary, setSessionProjectContextPin } from './sessionKnowledgeApi';
=======
import { setSessionProjectContextPin, syncSessionKnowledge } from './sessionKnowledgeApi';
import { opencodeClient } from './opencode/client';
>>>>>>> bc50ba56a

interface RestorableSpy { mockRestore(): void }

<<<<<<< HEAD
let request: RestorableSpy | null = null;
=======
let request: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>> | null = null;
let requestBodies: unknown[] = [];

const capturePaths = (): string[] => {
  const paths: string[] = [];
  request = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    // The path and the directory header together say where the request goes.
    const pathname = new URL(input instanceof Request ? input.url : String(input), 'http://app.test').pathname;
    if (pathname === '/api/config/settings') {
      return Response.json({ responseStyleEnabled: true, responseStylePreset: 'concise' });
    }
    const directory = new Headers(init?.headers).get('x-opencode-directory');
    paths.push(`${pathname} ${directory ?? '-'}`);
    requestBodies.push(init?.body ? JSON.parse(String(init.body)) : null);
    return Response.json({ recorded: true, pins: { notes: ['note-1'], plans: [] } });
  });
  return paths;
};
>>>>>>> bc50ba56a

afterEach(() => {
  request?.mockRestore();
  request = null;
  requestBodies = [];
});

test('VS Code writes, changes and clears the style through the real SDK transport', async () => {
  const originalWindow = globalThis.window;
  const calls: Array<{ url: string; method: string; body: string; directory: string | null }> = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true, writable: true,
    value: { __VSCODE_CONFIG__: {}, location: { origin: 'https://vscode.test', href: 'https://vscode.test/' } },
  });
  opencodeClient.reconnectToRuntimeBaseUrl();
  request = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const req = new Request(input, init);
    calls.push({ url: req.url, method: req.method, body: await req.text(), directory: req.headers.get('x-opencode-directory') });
    return new Response(null, { status: 204 });
  });
  try {
    await syncSessionKnowledge('/repo', 'session-1', 'First style');
    await syncSessionKnowledge('/repo', 'session-1', 'Second style');
    await syncSessionKnowledge('/repo', 'fusion-judge', 'Judge style');
    await syncSessionKnowledge('/repo', 'session-1', undefined);
    await syncSessionKnowledge('/repo', 'session-1', null);
    expect(calls.map(c => [new URL(c.url).pathname, c.method, c.body, c.directory])).toEqual([
      ['/api/experimental/session/session-1/instructions/entries/openchamber.response-style', 'PUT', JSON.stringify({ value: 'First style' }), '%2Frepo'],
      ['/api/experimental/session/session-1/instructions/entries/openchamber.response-style', 'PUT', JSON.stringify({ value: 'Second style' }), '%2Frepo'],
      ['/api/experimental/session/fusion-judge/instructions/entries/openchamber.response-style', 'PUT', JSON.stringify({ value: 'Judge style' }), '%2Frepo'],
      ['/api/experimental/session/session-1/instructions/entries/openchamber.response-style', 'DELETE', '', '%2Frepo'],
    ]);
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: originalWindow });
    opencodeClient.reconnectToRuntimeBaseUrl();
  }
});

describe('sessionKnowledgeApi', () => {
  test('fetchSessionKnowledgeSummary returns empty summary when directory is null', async () => {
    const summary = await fetchSessionKnowledgeSummary(null);
    expect(summary).toEqual({ notes: [], plans: [], memory: { global: 0, project: 0 } });
  });

<<<<<<< HEAD
  test('fetchSessionKnowledgeSummary fetches and parses summary', async () => {
    request = spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://app.test');
      expect(url.pathname).toBe('/api/session-knowledge/summary');
      expect(url.searchParams.get('directory')).toBe('/workspace/repo');
      expect(url.searchParams.get('sessionId')).toBe('ses-1');
      return Response.json({
        notes: [{ id: 'n1', body: 'Note body' }],
        plans: [{ id: 'p1', title: 'Plan title' }],
        memory: { global: 2, project: 1 },
      });
    });

    const summary = await fetchSessionKnowledgeSummary('/workspace/repo', 'ses-1');
    expect(summary).toEqual({
      notes: [{ id: 'n1', body: 'Note body' }],
      plans: [{ id: 'p1', title: 'Plan title' }],
      memory: { global: 2, project: 1 },
    });
=======
  test('sends the response style with the session knowledge', async () => {
    capturePaths();
    await syncSessionKnowledge(SPACE_DIRECTORY, 'session-1', 'Keep replies short.');

    expect(JSON.stringify(requestBodies[0])).toContain('Keep replies short.');
  });

  test('a pin reaches the server inside the space', async () => {
    const paths = capturePaths();
    expect(await setSessionProjectContextPin(SPACE_DIRECTORY, 'session-1', 'note', 'note-1', true)).toEqual({ notes: ['note-1'], plans: [] });
    expect(paths).toEqual([`/api/session-knowledge/pin ${encodeURIComponent(SPACE_DIRECTORY)}`]);
>>>>>>> bc50ba56a
  });

  test('fetchSessionKnowledgeSummary falls back to empty summary on network error', async () => {
    request = spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response('error', { status: 500 });
    });

    const summary = await fetchSessionKnowledgeSummary('/failed/repo', 'ses-failed');
    expect(summary).toEqual({ notes: [], plans: [], memory: { global: 0, project: 0 } });
  });

  test('setSessionProjectContextPin sends pin mutation and returns pins', async () => {
    request = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://app.test');
      expect(url.pathname).toBe('/api/session-knowledge/pin');
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({
        directory: '/workspace/repo',
        sessionId: 'ses-1',
        kind: 'note',
        id: 'n1',
        pinned: true,
      });
      return Response.json({ pins: { notes: ['n1'], plans: [] } });
    });

    const result = await setSessionProjectContextPin('/workspace/repo', 'ses-1', 'note', 'n1', true);
    expect(result).toEqual({ notes: ['n1'], plans: [] });
  });
});
