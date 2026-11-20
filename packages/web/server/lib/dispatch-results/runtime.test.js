import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';

import { buildDispatchResultMessage, createDispatchResultsRuntime, readDispatchOutcome } from './runtime.js';

const scope = { sessionId: 'ses_parent', rootSessionId: 'ses_parent', projectId: 'project-1', workspaceId: 'workspace-1', cwd: '/repo' };
const service = {
  open: async () => ({ session: { sessionId: 'ses_child', runtimeStatus: 'idle' } }),
  history: async () => ({ turns: [], messages: [], nextCursor: null }),
  list: async () => ({ items: [], errors: {} }),
  send: async () => undefined,
};

const makeRuntime = async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dispatch-results-'));
  const runtime = createDispatchResultsRuntime({ sessionService: service, resolveSessionScope: async () => scope, dataDir, now: () => 1000 });
  return { runtime, dataDir };
};

describe('dispatch-results canonical consumer', () => {
  const createDelivery = async (overrides = {}) => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dispatch-delivery-'));
    const send = vi.fn(async () => undefined);
    const sessionService = {
      ...service,
      history: async (id) => id === 'ses_child' ? {
        turns: [{ turnId: 'turn-1', status: 'completed', finishedAt: 20 }],
        messages: [{ turnId: 'turn-1', role: 'assistant', parts: [{ type: 'text', content: 'done' }] }],
      } : { messages: [{ role: 'assistant', providerId: 'provider-1', modelId: 'model-1' }] },
      send,
      ...overrides,
    };
    const create = () => createDispatchResultsRuntime({ sessionService, resolveSessionScope: async () => scope,
      dataDir, quietMs: 1, retryDelayMs: () => 60_000, now: () => 1000 });
    return { runtime: create(), create, dataDir, send, sessionService };
  };

  it('persists an opaque command ID before delivering a canonical result', async () => {
    const { runtime, dataDir, send } = await createDelivery();
    try {
      await runtime.register({ parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 10 });
      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
      expect(send.mock.calls[0]).toEqual(['ses_parent', expect.objectContaining({
        input: expect.objectContaining({ context: [expect.objectContaining({ kind: 'synthetic', text: expect.stringContaining('done') })] }),
      }), expect.stringMatching(/^msg_/)]);
      await vi.waitFor(() => expect(runtime.pending()).toHaveLength(0));
      await runtime.flush();
      expect(JSON.parse(await fs.readFile(path.join(dataDir, 'dispatch-results.json'), 'utf8')).entries).toEqual([]);
    } finally { runtime.stop(); await runtime.flush(); await fs.rm(dataDir, { recursive: true, force: true }); }
  });

  it.each([{ turns: [], messages: [] }, null])('does not manufacture a result from an empty or unavailable history', async (page) => {
    const { runtime, dataDir, send } = await createDelivery({ history: async () => page });
    try {
      await runtime.register({ parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 10 });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(send).not.toHaveBeenCalled();
      expect(runtime.pending()).toHaveLength(1);
    } finally { runtime.stop(); await runtime.flush(); await fs.rm(dataDir, { recursive: true, force: true }); }
  });

  it('retries a canonical admission conflict after restart with the same command ID', async () => {
    const failure = Object.assign(new Error('Parent is busy'), { status: 409 });
    const send = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const { runtime, create, dataDir } = await createDelivery({ send });
    let restored;
    try {
      await runtime.register({ parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 10 });
      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
      await runtime.flush();
      expect(runtime.pending()).toHaveLength(1);
      const commandId = runtime.pending()[0].messageId;
      expect(JSON.parse(await fs.readFile(path.join(dataDir, 'dispatch-results.json'), 'utf8')).entries[0].messageId).toBe(commandId);
      runtime.stop();
      restored = create();
      restored.start();
      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
      expect(send.mock.calls.map((call) => call[2])).toEqual([commandId, commandId]);
      await vi.waitFor(() => expect(restored.pending()).toHaveLength(0));
    } finally {
      runtime.stop(); restored?.stop(); await runtime.flush(); await restored?.flush();
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  it('keeps a registered child result scoped to its parent and persists it', async () => {
    const { runtime, dataDir } = await makeRuntime();

    const result = await runtime.register({ parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 10, afterIdleId: null });
    await runtime.flush();

    expect(result.id).toMatch(/^dispatch-1000-/);
    expect(runtime.pending()).toHaveLength(1);
    expect(JSON.parse(await fs.readFile(path.join(dataDir, 'dispatch-results.json'), 'utf8')).entries).toHaveLength(1);
    runtime.stop();
  });

  it('recognizes only a completed turn after the dispatch timestamp', () => {
    const outcome = readDispatchOutcome({
      turns: [{ turnId: 'turn-2', status: 'completed', finishedAt: 20 }],
      messages: [{ turnId: 'turn-2', role: 'assistant', parts: [{ type: 'text', content: 'done' }] }],
    }, 10);
    expect(outcome).toEqual({ state: 'completed', text: 'done', errorMessage: '' });
    expect(buildDispatchResultMessage({ sessionId: 'ses_child', title: 'worker', outcome }).metadata).toEqual({ source: 'openchamber-session', sessionID: 'ses_child', state: 'completed', title: 'worker' });
  });

  it('returns terminal reply text when an initial post-dispatch turn only has tool calls', () => {
    const outcome = readDispatchOutcome({
      turns: [
        { turnId: 'turn-1', status: 'completed', finishedAt: 20 },
        { turnId: 'turn-2', status: 'completed', finishedAt: 30 },
      ],
      messages: [
        { turnId: 'turn-1', role: 'assistant', parts: [{ type: 'tool_call', callId: 'c1', toolName: 'read' }] },
        { turnId: 'turn-2', role: 'assistant', parts: [{ type: 'text', content: 'done' }] },
      ],
    }, 10);
    expect(outcome).toEqual({ state: 'completed', text: 'done', errorMessage: '' });
  });

  it.each([['not JSON', '{ not json'], ['JSON of another shape', '{"version":1}']])('keeps a file that is %s aside instead of overwriting it', async (_label, content) => {
    const { runtime, dataDir } = await makeRuntime();
    await fs.writeFile(path.join(dataDir, 'dispatch-results.json'), content);
    await runtime.load();
    const files = await fs.readdir(dataDir);
    expect(files.some((name) => name.startsWith('dispatch-results.json.corrupt-'))).toBe(true);
    expect(runtime.pending()).toEqual([]);
  });

  it('fails a registration that did not reach the disk and forgets the entry', async () => {
    const { runtime, dataDir } = await makeRuntime();
    await runtime.load();
    // A directory where the file goes makes the atomic rename fail.
    await fs.mkdir(path.join(dataDir, 'dispatch-results.json'));
    await expect(runtime.register({ parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 10 })).rejects.toThrow();
    expect(runtime.pending()).toEqual([]);
  });
});
