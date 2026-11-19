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
    expect(summary).toEqual({ notes: [], plans: [] });
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
      });
    });

    const summary = await fetchSessionKnowledgeSummary('/workspace/repo', 'ses-1');
    expect(summary).toEqual({
      notes: [{ id: 'n1', body: 'Note body' }],
      plans: [{ id: 'p1', title: 'Plan title' }],
    });
  });

  test('fetchSessionKnowledgeSummary falls back to empty summary on network error', async () => {
    request = spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response('error', { status: 500 });
    });

    const summary = await fetchSessionKnowledgeSummary('/failed/repo', 'ses-failed');
    expect(summary).toEqual({ notes: [], plans: [] });
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

test('a summary read while a pin is written is not served from the cache afterwards', async () => {
  const { fetchSessionKnowledgeSummary } = await import('./sessionKnowledgeApi');
  let pinned = false;
  let releasePin!: () => void;
  const pinWritten = new Promise<void>((resolve) => { releasePin = resolve; });
  let summaryReads = 0;
  request = spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const pathname = new URL(input instanceof Request ? input.url : String(input), 'http://app.test').pathname;
    if (pathname === '/api/session-knowledge/pin') {
      await pinWritten;
      pinned = true;
      return Response.json({ pins: { notes: [], plans: ['p1'] } });
    }
    summaryReads += 1;
    return Response.json({ notes: [], plans: pinned ? [{ id: 'p1', title: 'Plan' }] : [] });
  });

  const write = setSessionProjectContextPin('/pin-cache', 'ses_1', 'plan', 'p1', true);
  expect((await fetchSessionKnowledgeSummary('/pin-cache', 'ses_1')).plans).toEqual([]);
  releasePin();
  await write;
  expect((await fetchSessionKnowledgeSummary('/pin-cache', 'ses_1')).plans.map((plan) => plan.id)).toEqual(['p1']);
  expect(summaryReads).toBe(2);
});
