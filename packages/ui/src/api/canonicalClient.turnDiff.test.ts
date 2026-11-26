import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type * as C from '@openchamber/agent-contract';
import { CanonicalClient } from './canonicalClient';
import { configureRuntimeUrlResolver, getRuntimeUrlResolver, setRuntimeUrlResolver, type RuntimeUrlResolver } from '../lib/runtime-url';

const sessionId = 'session_expected';
const turnId = 'turn_expected';
const client = new CanonicalClient();

const readyDiff: C.TurnDiff = {
  sessionId,
  turnId,
  state: 'ready',
  files: [{
    path: 'src/a.ts',
    status: 'modified',
    before: 'const a = 1;\n',
    after: 'const a = 2;\n',
    patch: '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-const a = 1;\n+const a = 2;\n',
    additions: 1,
    deletions: 1,
    provenance: [{ tool: 'edit', agent: 'session', at: 1774201002000 }],
    truncated: false,
    incomplete: false,
  }],
};

let handler: (request: IncomingMessage, response: ServerResponse) => void;
let server: Server;
let previousResolver: RuntimeUrlResolver;
let calls: string[];
const json = (response: ServerResponse, payload: C.JsonValue) => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(payload)); };
const respondWith = (payload: C.JsonValue) => { handler = (_request, response) => json(response, payload); };

beforeEach(async () => {
  calls = [];
  handler = (_request, response) => { response.writeHead(404); response.end(); };
  server = createServer((request, response) => { calls.push(`${request.method} ${request.url}`); handler(request, response); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  // SAFETY: the completed listen callback above binds a TCP port on loopback, so address() is a TCP address.
  const address = server.address() as AddressInfo;
  previousResolver = getRuntimeUrlResolver();
  configureRuntimeUrlResolver({ apiBaseUrl: `http://127.0.0.1:${address.port}` });
});
afterEach(async () => {
  setRuntimeUrlResolver(previousResolver);
  const closed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  server.closeAllConnections();
  await closed;
});

describe('CanonicalClient turn diff reads', () => {
  test('reads every explicit state through the turn-scoped route', async () => {
    respondWith(readyDiff);
    expect(await client.getTurnDiff(sessionId, turnId)).toEqual(readyDiff);
    expect(calls[0]).toBe(`GET /api/agent/v1/sessions/${sessionId}/turns/${turnId}/diff`);

    for (const state of ['empty', 'unsupported'] as const) {
      const diff: C.TurnDiff = { sessionId, turnId, state, files: [] };
      respondWith(diff);
      expect(await client.getTurnDiff(sessionId, turnId)).toEqual(diff);
    }
    const failed: C.TurnDiff = { sessionId, turnId, state: 'failed', files: [], error: 'journal unreadable' };
    respondWith(failed);
    expect(await client.getTurnDiff(sessionId, turnId)).toEqual(failed);
  });

  test('rejects a diff answering another session or turn', async () => {
    respondWith({ ...readyDiff, sessionId: 'session_other' });
    await expect(client.getTurnDiff(sessionId, turnId)).rejects.toThrow();
    respondWith({ ...readyDiff, turnId: 'turn_other' });
    await expect(client.getTurnDiff(sessionId, turnId)).rejects.toThrow();
  });

  test('rejects inconsistent state payloads rather than publishing them', async () => {
    // Rows on a non-ready state and a ready read without rows both violate the
    // contract invariants; the schema refuses them before the caller sees data.
    respondWith({ sessionId, turnId, state: 'empty', files: readyDiff.files });
    await expect(client.getTurnDiff(sessionId, turnId)).rejects.toThrow();
    respondWith({ sessionId, turnId, state: 'ready', files: [] });
    await expect(client.getTurnDiff(sessionId, turnId)).rejects.toThrow();
    respondWith({ sessionId, turnId, state: 'failed', files: [] });
    await expect(client.getTurnDiff(sessionId, turnId)).rejects.toThrow();
  });

  test('encodes identity segments that carry separators', async () => {
    respondWith({ ...readyDiff, sessionId: 'session/with slash', turnId: 'turn?question' });
    expect(await client.getTurnDiff('session/with slash', 'turn?question')).toEqual({ ...readyDiff, sessionId: 'session/with slash', turnId: 'turn?question' });
    expect(calls[0]).toBe('GET /api/agent/v1/sessions/session%2Fwith%20slash/turns/turn%3Fquestion/diff');
  });
});
