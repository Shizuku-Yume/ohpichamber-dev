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

<<<<<<< HEAD
  it('recognizes only a completed turn after the dispatch timestamp', () => {
    const outcome = readDispatchOutcome({
      turns: [{ turnId: 'turn-2', status: 'completed', finishedAt: 20 }],
      messages: [{ turnId: 'turn-2', role: 'assistant', parts: [{ type: 'text', content: 'done' }] }],
    }, 10);
    expect(outcome).toEqual({ state: 'completed', text: 'done', errorMessage: '' });
    expect(buildDispatchResultMessage({ sessionId: 'ses_child', title: 'worker', outcome }).metadata).toEqual({ source: 'openchamber-session', sessionID: 'ses_child', state: 'completed', title: 'worker' });
=======
  it('delivers a turn that ended before the entry existed', async () => {
    const { runtime, openCode } = await createRuntime();
    openCode.state.records.ses_child.push(user(11), assistant('Quick answer', 12), idle('succeeded', 13));
    await runtime.register({ parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 10 });
    await settle();
    expect(openCode.state.synthetic).toHaveLength(1);
  });

  it('waits for the dispatched session\'s subagents before calling the turn over', async () => {
    const { runtime, openCode } = await createRuntime();
    openCode.state.records.ses_child.push(user(11), assistant('Waiting on a subagent', 12), idle('succeeded', 13));
    openCode.state.children.ses_child = ['ses_grandchild'];
    openCode.state.active.ses_grandchild = { type: 'running' };
    await runtime.register({ parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 10 });
    await settle();
    expect(openCode.state.synthetic).toEqual([]);

    delete openCode.state.active.ses_grandchild;
    openCode.state.records.ses_child.push(assistant('Final answer', 40), idle('succeeded', 41));
    await settle();
    expect(openCode.state.synthetic).toEqual([expect.objectContaining({ text: expect.stringContaining('Final answer') })]);
  });

  it('records the answer in an archived parent without waking it', async () => {
    // Async like the real archive store.
    const { runtime, openCode } = await createRuntime({ isSessionArchived: async (id) => id === 'ses_parent' });
    openCode.state.records.ses_child.push(user(11), assistant('Done', 12), idle('succeeded', 13));
    await runtime.register({ parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 10 });
    await settle();
    expect(openCode.state.synthetic).toEqual([expect.objectContaining({ resume: false })]);
  });

  it('wakes a parent the async archive store reports as not archived', async () => {
    // Seen live: the store's Promise was read as "archived", and no parent woke.
    const { runtime, openCode } = await createRuntime({ isSessionArchived: async () => false });
    openCode.state.records.ses_child.push(user(11), assistant('Done', 12), idle('succeeded', 13));
    await runtime.register({ parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 10 });
    await settle();
    expect(openCode.state.synthetic).toEqual([expect.objectContaining({ resume: true })]);
  });

  it('wakes the parent when the archive lookup fails', async () => {
    const { runtime, openCode } = await createRuntime({ isSessionArchived: async () => { throw new Error('store down'); } });
    openCode.state.records.ses_child.push(user(11), assistant('Done', 12), idle('succeeded', 13));
    await runtime.register({ parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 10 });
    await settle();
    expect(openCode.state.synthetic).toEqual([expect.objectContaining({ resume: true })]);
  });

  it('retries a failed delivery with the same message id, so it lands once', async () => {
    const { runtime, openCode } = await createRuntime();
    openCode.state.records.ses_child.push(user(11), assistant('Done', 12), idle('succeeded', 13));
    openCode.state.syntheticStatus.push(500);
    await runtime.register({ parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 10 });
    await settle();

    const posts = openCode.fetchImpl.mock.calls.filter(([url]) => url.endsWith('/synthetic')).map(([, init]) => JSON.parse(init.body).id);
    expect(posts).toHaveLength(2);
    expect(posts[0]).toBe(posts[1]);
    expect(openCode.state.synthetic).toHaveLength(1);
    expect(runtime.pending()).toEqual([]);
  });

  it('treats an id OpenCode already admitted as delivered', async () => {
    const { runtime, openCode } = await createRuntime();
    openCode.state.records.ses_child.push(user(11), assistant('Done', 12), idle('succeeded', 13));
    openCode.state.syntheticStatus.push(409);
    await runtime.register({ parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 10 });
    await settle();
    expect(runtime.pending()).toEqual([]);
  });

  it('drops the delivery when the parent no longer exists', async () => {
    const { runtime, openCode } = await createRuntime();
    openCode.state.records.ses_child.push(user(11), assistant('Done', 12), idle('succeeded', 13));
    openCode.state.syntheticStatus.push(404);
    await runtime.register({ parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 10 });
    await settle();
    expect(runtime.pending()).toEqual([]);
  });

  it('forgets results owed to a parent that was deleted', async () => {
    const { runtime, openCode, emit, dataDir } = await createRuntime();
    openCode.state.active.ses_child = { type: 'running' };
    await runtime.register({ parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 10 });
    emit({ type: 'session.deleted', properties: { sessionID: 'ses_parent', info: { id: 'ses_parent' } } });
    expect(runtime.pending()).toEqual([]);
    await runtime.flush();
    const stored = JSON.parse(await fs.readFile(path.join(dataDir, 'dispatch-results.json'), 'utf8'));
    expect(stored.entries).toEqual([]);
  });

  it('reports a dispatched session deleted before it finished as stopped', async () => {
    const { runtime, openCode, emit } = await createRuntime();
    openCode.state.active.ses_child = { type: 'running' };
    await runtime.register({ parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 10 });
    delete openCode.state.active.ses_child;
    delete openCode.state.sessions.ses_child;
    emit({ type: 'session.deleted', properties: { sessionID: 'ses_child', info: { id: 'ses_child' } } });
    await settle();
    expect(openCode.state.synthetic).toEqual([expect.objectContaining({
      metadata: { source: 'openchamber-session', sessionID: 'ses_child', state: 'cancelled' },
      text: expect.stringContaining('stopped before it finished'),
    })]);
  });

  it('retries when OpenCode cannot be asked, never guessing the turn is over', async () => {
    const openCode = createOpenCode();
    const original = openCode.fetchImpl.getMockImplementation();
    let failing = true;
    openCode.fetchImpl.mockImplementation(async (url, init) => {
      if (failing && url.includes('/api/session/active')) return json({ error: 'down' }, 503);
      return original(url, init);
    });
    const { runtime } = await createRuntime({ openCode });
    openCode.state.records.ses_child.push(user(11), assistant('Done', 12), idle('succeeded', 13));
    await runtime.register({ parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 10 });
    await settle();
    expect(openCode.state.synthetic).toEqual([]);

    failing = false;
    await settle();
    expect(openCode.state.synthetic).toHaveLength(1);
  });

  it('reports one result to a parent that sent several prompts into one run', async () => {
    const { runtime, openCode, emit } = await createRuntime();
    openCode.state.active.ses_child = { type: 'running' };
    openCode.state.records.ses_child.push(user(1), assistant('Earlier run', 2), idle('succeeded', 3));
    // Seen live: eight sends steered into the running turn, eight identical results.
    for (let index = 0; index < 8; index += 1) {
      await runtime.register({ parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 10 + index, afterIdleId: 'msg_i3' });
    }
    await runtime.register({ parentSessionId: 'ses_other', sessionId: 'ses_child', dispatchedAt: 20, afterIdleId: 'msg_i3' });
    // The first delivery fails, so the retry must reuse the one shared id.
    openCode.state.syntheticStatus.push(500);

    delete openCode.state.active.ses_child;
    openCode.state.records.ses_child.push(user(11), assistant('Toolbar fixed', 20), idle('succeeded', 30));
    emit({ type: 'session.status', properties: { sessionID: 'ses_child', status: { type: 'idle' } } });
    emit({ type: 'session.status', properties: { sessionID: 'ses_child', status: { type: 'idle' } } });
    await settle();

    expect(openCode.state.synthetic.map(({ sessionID }) => sessionID).sort()).toEqual(['ses_other', 'ses_parent']);
    expect(openCode.state.synthetic.every(({ text }) => text.includes('Toolbar fixed'))).toBe(true);
    expect(runtime.pending()).toEqual([]);
  });

  it('keeps the answer when one of the shared entries has no baseline', async () => {
    const { runtime, openCode, emit } = await createRuntime();
    openCode.state.active.ses_child = { type: 'running' };
    openCode.state.records.ses_child.push(user(1), assistant('Earlier run', 2), idle('succeeded', 3));
    // Its baseline read failed: it compares clocks and misses the reply that began before it.
    await runtime.register({ parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 25 });
    await runtime.register({ parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 26, afterIdleId: 'msg_i3' });

    delete openCode.state.active.ses_child;
    openCode.state.records.ses_child.push(user(11), assistant('Toolbar fixed', 20), idle('succeeded', 30));
    emit({ type: 'session.status', properties: { sessionID: 'ses_child', status: { type: 'idle' } } });
    await settle();

    expect(openCode.state.synthetic).toEqual([expect.objectContaining({ text: expect.stringContaining('Toolbar fixed') })]);
    expect(runtime.pending()).toEqual([]);
  });

  it('still reports a newer run next to an entry whose earlier attempt landed', async () => {
    const dataDir = await makeDataDir();
    const landed = 'msg_000000000001aaaaaaaaaaaaaa';
    await fs.writeFile(path.join(dataDir, 'dispatch-results.json'), JSON.stringify({
      version: 1,
      entries: [
        { id: 'dispatch-a', parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 10, afterIdleId: null, messageId: landed },
        { id: 'dispatch-b', parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 20, afterIdleId: 'msg_i13' },
      ],
    }));
    const openCode = createOpenCode();
    // The first run's result landed, but its response was lost before the entry was dropped.
    openCode.state.seenIds.add(landed);
    openCode.state.records.ses_child.push(user(11), assistant('First', 12), idle('succeeded', 13), user(21), assistant('Second', 22), idle('succeeded', 23));
    const { runtime } = await createRuntime({ dataDir, openCode });
    runtime.start();
    await settle();

    expect(openCode.state.synthetic).toEqual([expect.objectContaining({ text: expect.stringContaining('Second') })]);
    expect(runtime.pending()).toEqual([]);
  });

  it('delivers after a restart from what was persisted', async () => {
    const dataDir = await makeDataDir();
    const first = await createRuntime({ dataDir });
    first.openCode.state.active.ses_child = { type: 'running' };
    await first.runtime.register({ parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 10 });
    first.runtime.stop();

    const openCode = createOpenCode();
    openCode.state.records.ses_child.push(user(11), assistant('After restart', 12), idle('succeeded', 13));
    const second = await createRuntime({ dataDir, openCode });
    second.runtime.start();
    await settle();
    expect(openCode.state.synthetic).toEqual([expect.objectContaining({ sessionID: 'ses_parent', text: expect.stringContaining('After restart') })]);
>>>>>>> bc50ba56a
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
