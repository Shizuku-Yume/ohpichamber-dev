import { describe, expect, test } from 'bun:test';
import type { IncomingMessage } from 'node:http';
import { sessionSurfaceRoute } from './routes.ts';

const sessionId = 'sess_recap_1';
const subagentId = 'sub_agent_1';

const request = (method: string): IncomingMessage => ({ method }) as IncomingMessage;
const url = (path: string): URL => new URL(path, 'http://localhost');

/** The registry surface the routes touch, without opening a native session. */
const registry = (): Parameters<typeof sessionSurfaceRoute>[0] => ({
  listRecaps: async (id: string) => [
    { sessionId: id, cwd: '/tmp/project', recap: 'Sixteen tiles now render on the board', createdAt: 1_700_000_000_000 },
  ],
  listHubSubagents: async () => [
    { subagentId, childSessionId: 'child_1', parentSessionId: sessionId, role: 'scout', status: 'parked' as const, tokens: 1200, persisted: true },
  ],
  subagentTranscript: async (_id: string, agentId: string) => ({
    subagentId: agentId, sessionFile: '/tmp/project/.agent/child_1.jsonl',
    entries: [{ entryId: 'entry_1', role: 'assistant' as const, text: 'Found the reducer', toolCalls: [], createdAt: 1_700_000_000_000 }],
  }),
  subagentTreeCost: async (id: string) => ({ sessionId: id, directCost: 0.02, treeCost: 0.11 }),
  tools: async (id: string) => ({ sessionId: id, tools: [{ name: 'read', label: 'Read', description: 'Read files', tier: 'read' as const, availability: true }] }),
});

describe('sessionSurfaceRoute', () => {
  test('serves journaled recaps for an admitted session', async () => {
    const response = await sessionSurfaceRoute(registry(), request('GET'), url(`/api/agent/v1/sessions/${sessionId}/recaps`));
    expect(response?.status).toBe(200);
    expect(response?.body).toMatchObject({ recaps: [{ sessionId, recap: 'Sixteen tiles now render on the board' }] });
  });
  test('serves tool catalog for an admitted session', async () => {
    const response = await sessionSurfaceRoute(registry(), request('GET'), url(`/api/agent/v1/sessions/${sessionId}/tools`));
    expect(response?.status).toBe(200);
    expect(response?.body).toMatchObject({ sessionId, tools: [{ name: 'read', label: 'Read', tier: 'read', availability: true }] });
  });

  test('serves the hub roster, transcript, and tree cost', async () => {
    const roster = await sessionSurfaceRoute(registry(), request('GET'), url(`/api/agent/v1/sessions/${sessionId}/subagents`));
    expect(roster?.body).toMatchObject({ subagents: [{ subagentId, persisted: true }] });

    const transcript = await sessionSurfaceRoute(registry(), request('GET'), url(`/api/agent/v1/sessions/${sessionId}/subagents/${subagentId}/transcript`));
    expect(transcript?.body).toMatchObject({ subagentId, entries: [{ text: 'Found the reducer' }] });

    const cost = await sessionSurfaceRoute(registry(), request('GET'), url(`/api/agent/v1/sessions/${sessionId}/subagents/tree-cost`));
    expect(cost?.body).toMatchObject({ treeCost: 0.11 });
  });

  test('leaves unrelated routes and non-GET requests to the caller', async () => {
    expect(await sessionSurfaceRoute(registry(), request('GET'), url(`/api/agent/v1/sessions/${sessionId}/history`))).toBeNull();
    expect(await sessionSurfaceRoute(registry(), request('GET'), url('/api/agent/v1/workspaces'))).toBeNull();
    expect(await sessionSurfaceRoute(registry(), request('POST'), url(`/api/agent/v1/sessions/${sessionId}/recaps`))).toBeNull();
    expect(await sessionSurfaceRoute(registry(), request('GET'), url(`/api/agent/v1/sessions/${sessionId}/subagents/${subagentId}/nope`))).toBeNull();
  });

  test('refuses an identity that cannot be decoded', async () => {
    await expect(sessionSurfaceRoute(registry(), request('GET'), url('/api/agent/v1/sessions/%ZZ/recaps'))).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });
});
