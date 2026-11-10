import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { fetchSessionKnowledgeSummary, setSessionProjectContextPin } from './sessionKnowledgeApi';

interface RestorableSpy { mockRestore(): void }

let request: RestorableSpy | null = null;

afterEach(() => {
  request?.mockRestore();
  request = null;
});

describe('sessionKnowledgeApi', () => {
  test('fetchSessionKnowledgeSummary returns empty summary when directory is null', async () => {
    const summary = await fetchSessionKnowledgeSummary(null);
    expect(summary).toEqual({ notes: [], plans: [], memory: { global: 0, project: 0 } });
  });

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
