import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { buildDispatchResultMessage, createDispatchResultsRuntime, readDispatchOutcome } from './runtime.js';

const scope = { sessionId: 'ses_parent', rootSessionId: 'ses_parent', projectId: 'project-1', workspaceId: 'workspace-1', cwd: '/repo' };
const service = {
  open: async () => ({ session: { sessionId: 'ses_child', runtimeStatus: 'idle' } }),
  history: async () => ({ turns: [], messages: [], nextCursor: null }),
  list: async () => ({ sessions: [] }),
  send: async () => undefined,
};

const makeRuntime = async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dispatch-results-'));
  const runtime = createDispatchResultsRuntime({ sessionService: service, resolveSessionScope: async () => scope, dataDir, now: () => 1000 });
  return { runtime, dataDir };
};

describe('dispatch-results canonical consumer', () => {
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
});
