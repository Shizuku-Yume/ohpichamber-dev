import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenChamberSessionService } from '../openchamber-sessions/routes.js';
import { createHostSessionState } from '../host/session-state.js';
import { runtimeSession, turn, message, snapshot as snapshotFixture, history as historyFixture } from '../event-stream/canonical-test-fixtures.js';

import {
  FINAL_MARKER_CLEAN,
  FINAL_MARKER_DISPUTED,
  LOOP_RULES,
  MAX_ROUNDS,
  createAutoReviewRuntime,
  readDisputeSummary,
  readReviewVerdict,
} from './runtime.js';

const ORIGINAL = 'ses_original';
const REVIEW = 'ses_review';
const DIRECTORY = '/repo';

const temporaryDirectories = [];
const runtimes = [];
const observers = new Set();
const notify = () => {
  for (const observer of observers) observer();
};

afterEach(async () => {
  const stopping = runtimes.splice(0);
  for (const runtime of stopping) runtime.stop();
  await Promise.all(stopping.map((runtime) => runtime.flush()));
  vi.useRealTimers();
  observers.clear();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

const makeDataDir = async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openchamber-auto-review-'));
  temporaryDirectories.push(directory);
  return directory;
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Canonical session service fixture. */
const createMockSessionService = () => {
  const sessions = new Map([
    [ORIGINAL, { sessionId: ORIGINAL, runtimeStatus: 'idle', workspaceId: 'ws-1' }],
    [REVIEW, { sessionId: REVIEW, runtimeStatus: 'idle', workspaceId: 'ws-1' }],
  ]);
  const sends = [];
  const replies = { [ORIGINAL]: [], [REVIEW]: [] };
  const historyPages = { [ORIGINAL]: { turns: [], messages: [] }, [REVIEW]: { turns: [], messages: [] } };
  let failSends = 0;
  let counter = 0;

  const ensure = (id) => {
    if (!sessions.has(id)) sessions.set(id, { sessionId: id, runtimeStatus: 'idle', workspaceId: 'ws-1' });
    if (!replies[id]) replies[id] = [];
    if (!historyPages[id]) historyPages[id] = { turns: [], messages: [] };
  };

  return {
    sessions,
    sends,
    replies,
    historyPages,
    setFailSends(n) { failSends = n; },
    async open(id) {
      ensure(id);
      return { session: { ...sessions.get(id) } };
    },
    async list(workspaceId) {
      return { items: Array.from(sessions.values()).filter((s) => !workspaceId || s.workspaceId === workspaceId) };
    },
    async send(sessionId, body, commandKey) {
      ensure(sessionId);
      sends.push({ sessionId, body, commandKey });
      if (failSends > 0) { failSends -= 1; throw new Error('send boom'); }
      const scripted = replies[sessionId].shift();
      if (scripted !== undefined) {
        counter += 1;
        const turnId = `turn_${counter}`;
        const outcome = typeof scripted === 'string' ? { state: 'completed', text: scripted } : scripted;
        const turn = {
          turnId,
          status: outcome.outcome === 'interrupted' ? 'cancelled' : outcome.outcome === 'failed' ? 'failed' : outcome.state ?? 'completed',
          finishedAt: Date.now(),
          error: outcome.error,
        };
        const message = {
          messageId: `msg_${counter}`,
          turnId,
          role: 'assistant',
          parts: outcome.text ? [{ type: 'text', content: outcome.text }] : [],
        };
        historyPages[sessionId].turns.unshift(turn);
        if (outcome.text) historyPages[sessionId].messages.unshift(message);
      }
<<<<<<< HEAD
      return { ok: true };
    },
    async history(sessionId) {
      ensure(sessionId);
      const page = historyPages[sessionId];
      return { turns: [...page.turns], messages: [...page.messages] };
    },
  };
||||||| bc50ba56aa
      const id = decodeURIComponent(sessionRecord[1]);
      return json({ data: { id, revert: state.reverts[id] ? { messageID: state.reverts[id] } : null } });
    }
    const revertCommit = pathname.match(/^\/api\/session\/([^/]+)\/revert\/commit$/);
    if (revertCommit && method === 'POST') {
      if (state.failRevertCommits > 0) {
        state.failRevertCommits -= 1;
        return json({ error: 'boom' }, 500);
      }
      commitRevert(decodeURIComponent(revertCommit[1]));
      return new Response(null, { status: 204 });
    }
    const match = pathname.match(/^\/api\/session\/([^/]+)\/(message|prompt|synthetic)$/);
    if (!match) return json({ error: 'not found' }, 404);
    const sessionID = decodeURIComponent(match[1]);
    if (!state.records[sessionID]) return json({ error: 'not found' }, 404);
    if (match[2] === 'message') return json({ data: [...state.records[sessionID]].reverse(), cursor: {} });
    const body = JSON.parse(init.body);
    if (match[2] === 'prompt' && state.failPrompts > 0) {
      state.failPrompts -= 1;
      return json({ error: 'boom' }, 500);
    }
    if (state.seenIds.has(body.id)) return json({ error: 'conflict' }, 409);
    state.seenIds.add(body.id);
    if (match[2] === 'synthetic') {
      state.synthetic.push({ sessionID, ...body });
      state.records[sessionID].push({ type: 'synthetic', id: body.id, text: body.text });
      return json({ data: { id: body.id } });
    }
    // As OpenCode: a prompt commits a staged revert before it is admitted.
    commitRevert(sessionID);
    state.prompts.push({ sessionID, ...body });
    state.records[sessionID].push({ type: 'user', id: body.id, text: body.text });
    runTurn(sessionID);
    return json({ data: { id: body.id } });
  });
  return { state, fetchImpl };
=======
      const id = decodeURIComponent(sessionRecord[1]);
      return json({ data: { id, revert: state.reverts[id] ? { messageID: state.reverts[id] } : null } });
    }
    const revertCommit = pathname.match(/^\/api\/session\/([^/]+)\/revert\/commit$/);
    if (revertCommit && method === 'POST') {
      if (state.failRevertCommits > 0) {
        state.failRevertCommits -= 1;
        return json({ error: 'boom' }, 500);
      }
      commitRevert(decodeURIComponent(revertCommit[1]));
      return new Response(null, { status: 204 });
    }
    const match = pathname.match(/^\/api\/session\/([^/]+)\/(message|prompt|synthetic)$/);
    if (!match) return json({ error: 'not found' }, 404);
    const sessionID = decodeURIComponent(match[1]);
    if (!state.records[sessionID]) return json({ error: 'not found' }, 404);
    if (match[2] === 'message') return json({ data: [...state.records[sessionID]].reverse(), cursor: {} });
    const body = JSON.parse(init.body);
    if (match[2] === 'prompt' && state.failPrompts > 0) {
      state.failPrompts -= 1;
      return json({ error: 'boom' }, 500);
    }
    if (state.seenIds.has(body.id)) return json({ error: 'conflict' }, 409);
    state.seenIds.add(body.id);
    if (match[2] === 'synthetic') {
      state.synthetic.push({ sessionID, ...body });
      state.records[sessionID].push({ type: 'synthetic', id: body.id, text: body.text });
      return json({ data: { id: body.id } });
    }
    // As OpenCode: a prompt commits a staged revert before it is admitted.
    commitRevert(sessionID);
    state.prompts.push({ sessionID, ...body });
    state.records[sessionID].push({ type: 'user', id: body.id, text: body.text });
    runTurn(sessionID);
    return json({ data: { id: body.id } });
  });
  const handleRequest = fetchImpl.getMockImplementation();
  fetchImpl.mockImplementation(async (...args) => {
    const response = await handleRequest(...args);
    notify();
    return response;
  });
  return { state, fetchImpl };
>>>>>>> upstream/main
};

const createHub = () => {
  let eventHandler = () => { };
  let statusHandler = () => { };
  const unsubscribed = { event: 0, status: 0 };
  const activeLeases = [];
  return {
    subscribeEvent(handler) {
      eventHandler = handler;
      return () => { unsubscribed.event += 1; eventHandler = () => { }; };
    },
    subscribeStatus(handler) {
      statusHandler = handler;
      return () => { unsubscribed.status += 1; statusHandler = () => { }; };
    },
    async retainSession(_id, _key) {
      const release = vi.fn(async () => { });
      activeLeases.push(release);
      return { release };
    },
    emit(event) { eventHandler(event); },
    emitStatus(status) { statusHandler(status); },
    unsubscribed,
    activeLeases,
  };
};

const createRuntime = async ({ dataDir, sessionService = createMockSessionService(), retryDelayMs = () => 5 } = {}) => {
  const hub = createHub();
  const broadcasts = [];
  const ended = [];
  const runtime = createAutoReviewRuntime({
<<<<<<< HEAD
    globalEventHub: hub,
    sessionService,
    broadcastUiEvent: (event) => broadcasts.push(event),
    onRunEnded: (run) => ended.push(run),
||||||| bc50ba56aa
    globalEventHub: {
      subscribeEvent(handler) { eventHandler = handler; return () => {}; },
      subscribeStatus() { return () => {}; },
    },
    buildOpenCodeUrl: (fetchPath) => `http://opencode.test${fetchPath}`,
    getOpenCodeAuthHeaders: () => ({}),
    broadcastUiEvent: (event) => broadcasts.push(event),
    onRunSettled: (sessionID) => settled.push(sessionID),
    onRunEnded: (run) => ended.push(run),
    routeSend,
=======
    globalEventHub: {
      subscribeEvent(handler) { eventHandler = handler; return () => {}; },
      subscribeStatus() { return () => {}; },
    },
    buildOpenCodeUrl: (fetchPath) => `http://opencode.test${fetchPath}`,
    getOpenCodeAuthHeaders: () => ({}),
    broadcastUiEvent: (event) => { broadcasts.push(event); notify(); },
    onRunSettled: (sessionID) => { settled.push(sessionID); notify(); },
    onRunEnded: (run) => { ended.push(run); notify(); },
    routeSend,
>>>>>>> upstream/main
    dataDir: dataDir ?? await makeDataDir(),
    quietMs: 0,
    retryDelayMs,
    subagentRecheckMs: 5,
    settleRecheckMs: 5,
  });
  runtimes.push(runtime);
  return {
    runtime,
    sessionService,
    broadcasts,
    ended,
    hub,
    emit: (event) => hub.emit(event),
  };
};

const prompts = {
  reviewStart: 'Review this.\n\n{{handoff}}',
  reviewRules: 'Review rules.',
  feedbackToImplementer: 'Feedback:\n{{review_feedback}}',
  responseToReviewer: 'Response:\n{{implementation_response}}',
};

const startInput = (extra = {}) => ({
  originalSessionID: ORIGINAL,
  reviewSessionID: REVIEW,
  directory: DIRECTORY,
  handoff: { text: 'Write a handoff.', instructions: 'Handoff rules.' },
  prompts,
  ...extra,
});

// Observe runtime callbacks and OpenCode responses, including ones already received.
const until = (check) => new Promise((resolve) => {
  const observe = () => {
    if (!check()) return;
    observers.delete(observe);
    resolve(true);
  };
  observers.add(observe);
  observe();
});

const runOf = (runtime) => runtime.snapshot().runs.find((run) => run.originalSessionID === ORIGINAL) ?? null;

describe('readReviewVerdict', () => {
  it('reads the final line and leaves it out of the feedback', () => {
    expect(readReviewVerdict(`Nit: rename x.\n${FINAL_MARKER_CLEAN}\n\n`)).toEqual({ kind: 'clean', feedback: 'Nit: rename x.' });
    expect(readReviewVerdict(`Still disagree on 2.\n${FINAL_MARKER_DISPUTED.toUpperCase()}`)).toEqual({ kind: 'disputed', feedback: 'Still disagree on 2.' });
    expect(readReviewVerdict(`1. Blocker.\n${FINAL_MARKER_CLEAN} because`)).toEqual({ kind: 'open', feedback: `1. Blocker.\n${FINAL_MARKER_CLEAN} because` });
  });
});

describe('readDisputeSummary', () => {
  it('takes what follows the last heading, else the whole review cut short', () => {
    expect(readDisputeSummary('Intro.\n## Disputed findings: 3 is wrong\nbecause X')).toBe('3 is wrong\nbecause X');
    expect(readDisputeSummary('No heading here.')).toBe('No heading here.');
    expect(readDisputeSummary('x'.repeat(3_000))).toHaveLength(2_000);
  });
});

describe('createAutoReviewRuntime', () => {
  it('carries a handoff, the review, the fixes and the re-review until nothing is left', async () => {
    const { runtime, sessionService, ended } = await createRuntime();
    sessionService.replies[ORIGINAL].push('The handoff.', 'Fixed the blocker.');
    sessionService.replies[REVIEW].push('1. Blocker: X breaks.', `Nit: a name.\n${FINAL_MARKER_CLEAN}`);
    runtime.start();
    await runtime.startRun(startInput());

    expect(await until(() => runOf(runtime)?.status === 'clean')).toBe(true);
    expect(sessionService.sends.map((s) => [s.sessionId, s.body.input.text])).toEqual([
      [ORIGINAL, 'Write a handoff.'],
      [REVIEW, 'Review this.\n\nThe handoff.'],
      [ORIGINAL, 'Feedback:\n1. Blocker: X breaks.'],
      [REVIEW, 'Response:\nFixed the blocker.'],
      [ORIGINAL, 'Feedback:\nNit: a name.'],
    ]);
    expect(sessionService.sends[0].body.input.context.map((c) => c.text)).toEqual(['Handoff rules.']);
    expect(sessionService.sends[1].body.input.context.map((c) => c.text)).toEqual(['Review rules.', LOOP_RULES]);
    expect(runOf(runtime)).toMatchObject({ status: 'clean', round: 1, maxRounds: MAX_ROUNDS });
    expect(await until(() => ended.length > 0)).toBe(true);
    expect(ended).toEqual([{ sessionId: ORIGINAL, directory: DIRECTORY, status: 'clean', error: undefined }]);
    const settledAt = runOf(runtime).updatedAt;
    expect(runtime.speaksFor(ORIGINAL, settledAt - 1)).toBe(true);
    expect(runtime.speaksFor(REVIEW, settledAt - 1)).toBe(true);
    expect(runtime.speaksFor(ORIGINAL, settledAt + 1)).toBe(false);
    expect(runtime.speaksFor('ses_someone_else', settledAt - 1)).toBe(false);
  });

  it('settles as disputed and sends nothing more when only contested declines are left', async () => {
    const { runtime, sessionService } = await createRuntime();
    sessionService.replies[REVIEW].push(`Finding 1 is fixed.\n\n**Disputed findings:**\n2. Implementer: the guard is dead code.\nMine: it runs on Windows.\n${FINAL_MARKER_DISPUTED}`);
    runtime.start();
    await runtime.startRun(startInput({ handoff: undefined, prompts: { ...prompts, reviewStart: 'Review the diff.' } }));

    expect(await until(() => runOf(runtime)?.status === 'disputed')).toBe(true);
    expect(sessionService.sends.map((s) => s.sessionId)).toEqual([REVIEW]);
    expect(runOf(runtime).dispute).toBe('2. Implementer: the guard is dead code.\nMine: it runs on Windows.');
  });

  it('stops at the round limit with its own status', async () => {
    const { runtime, sessionService } = await createRuntime();
    for (let round = 0; round <= MAX_ROUNDS; round += 1) {
      sessionService.replies[REVIEW].push(`Round ${round}: still open.`);
      sessionService.replies[ORIGINAL].push(`Round ${round}: fixed.`);
    }
    runtime.start();
    await runtime.startRun(startInput({ handoff: undefined }));

    expect(await until(() => runOf(runtime)?.status === 'limit')).toBe(true);
    expect(runOf(runtime).round).toBe(MAX_ROUNDS);
    expect(sessionService.sends.filter((s) => s.sessionId === REVIEW)).toHaveLength(MAX_ROUNDS + 1);
  });

  it('waits for a running session before it sends, so nothing steers into a live turn', async () => {
<<<<<<< HEAD
    const { runtime, sessionService, emit } = await createRuntime();
    sessionService.sessions.get(ORIGINAL).runtimeStatus = 'running';
||||||| bc50ba56aa
    const { runtime, openCode, emit } = await createRuntime();
    openCode.state.active = { [ORIGINAL]: { type: 'running' } };
=======
    vi.useFakeTimers();
    const { runtime, openCode, emit } = await createRuntime();
    openCode.state.active = { [ORIGINAL]: { type: 'running' } };
>>>>>>> upstream/main
    runtime.start();
    await runtime.startRun(startInput());
<<<<<<< HEAD
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(sessionService.sends).toEqual([]);
||||||| bc50ba56aa
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(openCode.state.prompts).toEqual([]);
=======
    await vi.advanceTimersByTimeAsync(0);
    await runtime.flush();
    expect(openCode.state.prompts).toEqual([]);
>>>>>>> upstream/main

<<<<<<< HEAD
    sessionService.sessions.get(ORIGINAL).runtimeStatus = 'idle';
    emit({ type: 'session.status', sessionId: ORIGINAL, runtimeStatus: 'idle', activeRunId: null });
    expect(await until(() => sessionService.sends.length === 1)).toBe(true);
||||||| bc50ba56aa
    openCode.state.active = {};
    emit({ type: 'session.status', properties: { sessionID: ORIGINAL, status: { type: 'idle' } } });
    expect(await until(() => openCode.state.prompts.length === 1)).toBe(true);
=======
    openCode.state.active = {};
    emit({ type: 'session.status', properties: { sessionID: ORIGINAL, status: { type: 'idle' } } });
    await vi.advanceTimersByTimeAsync(0);
    await runtime.flush();
    expect(await until(() => openCode.state.prompts.length === 1)).toBe(true);
>>>>>>> upstream/main
  });

  it('stops the run when the user stops the turn it waits on, and says so without notifying', async () => {
    const { runtime, sessionService, ended } = await createRuntime();
    sessionService.replies[ORIGINAL].push({ outcome: 'interrupted', text: 'Half a handoff' });
    runtime.start();
    await runtime.startRun(startInput());

    expect(await until(() => runOf(runtime)?.status === 'stopped')).toBe(true);
<<<<<<< HEAD
    expect(sessionService.sends).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 20));
||||||| bc50ba56aa
    expect(await until(() => settled.length > 0)).toBe(true);
    expect(settled).toEqual([ORIGINAL]);
    expect(openCode.state.prompts).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 20));
=======
    expect(await until(() => settled.length > 0)).toBe(true);
    expect(settled).toEqual([ORIGINAL]);
    expect(openCode.state.prompts).toHaveLength(1);
    await runtime.flush();
>>>>>>> upstream/main
    expect(ended).toEqual([]);
  });

  it('reports a failed turn with its error', async () => {
    const { runtime, sessionService } = await createRuntime();
    sessionService.replies[ORIGINAL].push({ outcome: 'failed', error: 'rate limited' });
    runtime.start();
    await runtime.startRun(startInput());

    expect(await until(() => runOf(runtime)?.status === 'failed')).toBe(true);
    expect(runOf(runtime).error).toBe("The implementer's turn failed: rate limited");
  });

  it('retries a failed send with the same ids and never admits a record twice, across a restart', async () => {
    const dataDir = await makeDataDir();
    const sessionService = createMockSessionService();
    sessionService.setFailSends(1);
    const first = await createRuntime({ dataDir, sessionService, retryDelayMs: () => 60_000 });
    first.runtime.start();
    await first.runtime.startRun(startInput());
    expect(await until(() => sessionService.sends.length === 1)).toBe(true);
    const initialKey = sessionService.sends[0].commandKey;
    first.runtime.stop();
    await first.runtime.flush();

    sessionService.replies[ORIGINAL].push('The handoff.');
    const second = await createRuntime({ dataDir, sessionService });
    second.runtime.start();
<<<<<<< HEAD
    expect(await until(() => sessionService.sends.length === 3)).toBe(true);
    expect(sessionService.sends[1].commandKey).toBe(initialKey);
    expect(sessionService.sends.map((s) => s.body.input.text)).toEqual([
      'Write a handoff.',
      'Write a handoff.',
      'Review this.\n\nThe handoff.',
||||||| bc50ba56aa
    expect(await until(() => openCode.state.prompts.length === 2)).toBe(true);
    expect(openCode.state.prompts.map((prompt) => prompt.text)).toEqual(['Write a handoff.', 'Review this.\n\nThe handoff.']);
    expect(openCode.state.synthetic.filter((item) => item.text === 'Handoff rules.')).toHaveLength(1);
  });

  // OpenCode's commit deletes everything admitted past the revert's boundary (#6244).
  describe('a revert staged on the session it sends to', () => {
    const syntheticTexts = (openCode, sessionID) => openCode.state.records[sessionID]
      .filter((record) => record.type === 'synthetic')
      .map((record) => record.text);
    const stageRevertOf = (openCode, sessionID) => {
      openCode.state.records[sessionID].push({ type: 'user', id: 'msg_reverted', text: 'reverted' });
      openCode.state.reverts[sessionID] = 'msg_reverted';
    };

    it('is committed before the handoff context goes into the reviewed session', async () => {
      const { runtime, openCode } = await createRuntime();
      stageRevertOf(openCode, ORIGINAL);
      openCode.state.replies[ORIGINAL].push('The handoff.');
      runtime.start();
      await runtime.startRun(startInput());

      expect(await until(() => openCode.state.prompts.length === 2)).toBe(true);
      expect(syntheticTexts(openCode, ORIGINAL)).toEqual(['Handoff rules.']);
      expect(openCode.state.records[ORIGINAL].map((record) => record.id)).not.toContain('msg_reverted');
    });

    it('is committed before the rules go into a reused review session', async () => {
      const { runtime, openCode } = await createRuntime();
      stageRevertOf(openCode, REVIEW);
      openCode.state.replies[ORIGINAL].push('The handoff.');
      openCode.state.replies[REVIEW].push(FINAL_MARKER_CLEAN);
      runtime.start();
      await runtime.startRun(startInput());

      expect(await until(() => runOf(runtime)?.status === 'clean')).toBe(true);
      expect(syntheticTexts(openCode, REVIEW)).toEqual(['Review rules.', LOOP_RULES]);
    });

    it.each([
      { failure: 'read', arm: (state) => { state.failSessionReads = 1; } },
      { failure: 'commit', arm: (state) => { state.failRevertCommits = 1; } },
    ])('keeps the send pending with nothing admitted when the $failure fails', async ({ arm }) => {
      const { runtime, openCode } = await createRuntime();
      stageRevertOf(openCode, ORIGINAL);
      arm(openCode.state);
      let admittedDuringFailure = null;
      const { fetchImpl } = openCode;
      const original = fetchImpl.getMockImplementation();
      fetchImpl.mockImplementation(async (url, init) => {
        const response = await original(url, init);
        if (response.status === 500) admittedDuringFailure = openCode.state.synthetic.length;
        return response;
      });
      openCode.state.replies[ORIGINAL].push('The handoff.');
      runtime.start();
      await runtime.startRun(startInput());

      expect(await until(() => openCode.state.prompts.length === 2)).toBe(true);
      expect(admittedDuringFailure).toBe(0);
      expect(syntheticTexts(openCode, ORIGINAL)).toEqual(['Handoff rules.']);
    });

    it('leaves the commit to the prompt when a send carries no context', async () => {
      const { runtime, openCode } = await createRuntime();
      openCode.state.replies[ORIGINAL].push('The handoff.');
      runtime.start();
      await runtime.startRun(startInput({ handoff: { text: 'Write a handoff.', instructions: '  ' } }));

      expect(await until(() => openCode.state.prompts.length >= 1)).toBe(true);
      const reads = openCode.fetchImpl.mock.calls.filter(([url]) => new URL(url).pathname === `/api/session/${ORIGINAL}`);
      expect(reads).toEqual([]);
    });

    it('reads the session and commits nothing when no revert is staged', async () => {
      const { runtime, openCode } = await createRuntime();
      openCode.state.replies[ORIGINAL].push('The handoff.');
      runtime.start();
      await runtime.startRun(startInput());

      expect(await until(() => openCode.state.prompts.length === 2)).toBe(true);
      expect(syntheticTexts(openCode, ORIGINAL)).toEqual(['Handoff rules.']);
      expect(openCode.fetchImpl.mock.calls.some(([url]) => String(url).endsWith('/revert/commit'))).toBe(false);
    });
  });

  it('routes a session on Auto before each prompt, and a routing failure sends nothing', async () => {
    const routed = [];
    let failRouting = true;
    const routeSend = async (send) => {
      if (failRouting) throw new Error('no fallback model');
      routed.push(send);
    };
    const { runtime, openCode } = await createRuntime({ routeSend, retryDelayMs: () => 20 });
    openCode.state.replies[ORIGINAL].push('The handoff.');
    runtime.start();
    await runtime.startRun(startInput());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(openCode.state.prompts).toEqual([]);
    expect(openCode.state.synthetic).toEqual([]);

    failRouting = false;
    expect(await until(() => openCode.state.prompts.length === 2)).toBe(true);
    expect(routed).toEqual([
      { sessionId: ORIGINAL, directory: DIRECTORY, text: 'Write a handoff.' },
      { sessionId: REVIEW, directory: DIRECTORY, text: 'Review this.\n\nThe handoff.' },
=======
    expect(await until(() => openCode.state.prompts.length === 2)).toBe(true);
    expect(openCode.state.prompts.map((prompt) => prompt.text)).toEqual(['Write a handoff.', 'Review this.\n\nThe handoff.']);
    expect(openCode.state.synthetic.filter((item) => item.text === 'Handoff rules.')).toHaveLength(1);
  });

  // OpenCode's commit deletes everything admitted past the revert's boundary (#6244).
  describe('a revert staged on the session it sends to', () => {
    const syntheticTexts = (openCode, sessionID) => openCode.state.records[sessionID]
      .filter((record) => record.type === 'synthetic')
      .map((record) => record.text);
    const stageRevertOf = (openCode, sessionID) => {
      openCode.state.records[sessionID].push({ type: 'user', id: 'msg_reverted', text: 'reverted' });
      openCode.state.reverts[sessionID] = 'msg_reverted';
    };

    it('is committed before the handoff context goes into the reviewed session', async () => {
      const { runtime, openCode } = await createRuntime();
      stageRevertOf(openCode, ORIGINAL);
      openCode.state.replies[ORIGINAL].push('The handoff.');
      runtime.start();
      await runtime.startRun(startInput());

      expect(await until(() => openCode.state.prompts.length === 2)).toBe(true);
      expect(syntheticTexts(openCode, ORIGINAL)).toEqual(['Handoff rules.']);
      expect(openCode.state.records[ORIGINAL].map((record) => record.id)).not.toContain('msg_reverted');
    });

    it('is committed before the rules go into a reused review session', async () => {
      const { runtime, openCode } = await createRuntime();
      stageRevertOf(openCode, REVIEW);
      openCode.state.replies[ORIGINAL].push('The handoff.');
      openCode.state.replies[REVIEW].push(FINAL_MARKER_CLEAN);
      runtime.start();
      await runtime.startRun(startInput());

      expect(await until(() => runOf(runtime)?.status === 'clean')).toBe(true);
      expect(syntheticTexts(openCode, REVIEW)).toEqual(['Review rules.', LOOP_RULES]);
    });

    it.each([
      { failure: 'read', arm: (state) => { state.failSessionReads = 1; } },
      { failure: 'commit', arm: (state) => { state.failRevertCommits = 1; } },
    ])('keeps the send pending with nothing admitted when the $failure fails', async ({ arm }) => {
      const { runtime, openCode } = await createRuntime();
      stageRevertOf(openCode, ORIGINAL);
      arm(openCode.state);
      let admittedDuringFailure = null;
      const { fetchImpl } = openCode;
      const original = fetchImpl.getMockImplementation();
      fetchImpl.mockImplementation(async (url, init) => {
        const response = await original(url, init);
        if (response.status === 500) admittedDuringFailure = openCode.state.synthetic.length;
        return response;
      });
      openCode.state.replies[ORIGINAL].push('The handoff.');
      runtime.start();
      await runtime.startRun(startInput());

      expect(await until(() => openCode.state.prompts.length === 2)).toBe(true);
      expect(admittedDuringFailure).toBe(0);
      expect(syntheticTexts(openCode, ORIGINAL)).toEqual(['Handoff rules.']);
    });

    it('leaves the commit to the prompt when a send carries no context', async () => {
      const { runtime, openCode } = await createRuntime();
      openCode.state.replies[ORIGINAL].push('The handoff.');
      runtime.start();
      await runtime.startRun(startInput({ handoff: { text: 'Write a handoff.', instructions: '  ' } }));

      expect(await until(() => openCode.state.prompts.length >= 1)).toBe(true);
      await runtime.flush();
      const reads = openCode.fetchImpl.mock.calls.filter(([url]) => new URL(url).pathname === `/api/session/${ORIGINAL}`);
      expect(reads).toEqual([]);
    });

    it('reads the session and commits nothing when no revert is staged', async () => {
      const { runtime, openCode } = await createRuntime();
      openCode.state.replies[ORIGINAL].push('The handoff.');
      runtime.start();
      await runtime.startRun(startInput());

      expect(await until(() => openCode.state.prompts.length === 2)).toBe(true);
      expect(syntheticTexts(openCode, ORIGINAL)).toEqual(['Handoff rules.']);
      expect(openCode.fetchImpl.mock.calls.some(([url]) => String(url).endsWith('/revert/commit'))).toBe(false);
    });
  });

  it('routes a session on Auto before each prompt, and a routing failure sends nothing', async () => {
    vi.useFakeTimers();
    const retryDelayMs = 20;
    const routed = [];
    let failRouting = true;
    let routingFailed = false;
    const routeSend = async (send) => {
      if (failRouting) {
        routingFailed = true;
        throw new Error('no fallback model');
      }
      routed.push(send);
    };
    const { runtime, openCode } = await createRuntime({ routeSend, retryDelayMs: () => retryDelayMs });
    openCode.state.replies[ORIGINAL].push('The handoff.');
    runtime.start();
    await runtime.startRun(startInput());
    await vi.advanceTimersByTimeAsync(0);
    await runtime.flush();
    expect(routingFailed).toBe(true);
    expect(openCode.state.prompts).toEqual([]);
    expect(openCode.state.synthetic).toEqual([]);

    failRouting = false;
    await vi.advanceTimersByTimeAsync(retryDelayMs);
    await runtime.flush();
    // Read the completed handoff, then deliver the review on its immediate timer.
    await vi.advanceTimersByTimeAsync(0);
    await runtime.flush();
    await vi.advanceTimersByTimeAsync(0);
    await runtime.flush();
    expect(await until(() => openCode.state.prompts.length === 2)).toBe(true);
    expect(routed).toEqual([
      { sessionId: ORIGINAL, directory: DIRECTORY, text: 'Write a handoff.' },
      { sessionId: REVIEW, directory: DIRECTORY, text: 'Review this.\n\nThe handoff.' },
>>>>>>> upstream/main
    ]);
  });

<<<<<<< HEAD
  // Reverts and routeSend removed in OMP architecture

||||||| bc50ba56aa
=======
  it('writes nothing once stop and flush return, even with a send still being answered', async () => {
    const dataDir = await makeDataDir();
    const openCode = createOpenCode();
    let answer = () => {};
    const answered = new Promise((resolve) => { answer = resolve; });
    const original = openCode.fetchImpl.getMockImplementation();
    openCode.fetchImpl.mockImplementation(async (url, init) => {
      const response = await original(url, init);
      if (new URL(url).pathname.endsWith('/prompt')) await answered;
      return response;
    });
    const { runtime } = await createRuntime({ dataDir, openCode });
    runtime.start();
    await runtime.startRun(startInput());
    expect(await until(() => openCode.state.prompts.length === 1)).toBe(true);

    runtime.stop();
    let flushReturned = false;
    const flushed = runtime.flush().then(() => { flushReturned = true; });
    try {
      // While the response is held, the saved send must remain pending and
      // flush must not return, even after a separate disk read completes.
      const stored = JSON.parse(await fs.readFile(path.join(dataDir, 'auto-review.json'), 'utf8'));
      expect(stored.runs[0].send.text).toBe('Write a handoff.');
      expect(flushReturned).toBe(false);
    } finally {
      answer();
      await flushed;
    }
    await fs.rm(dataDir, { recursive: true, force: true });
    await runtime.flush();
    await expect(fs.stat(dataDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

>>>>>>> upstream/main
  it('holds the queue until its runs are loaded after a start', async () => {
    const { runtime } = await createRuntime();
    expect(runtime.holdsDelivery(ORIGINAL)).toBe(true);
    runtime.start();
    await runtime.startupLoad;
    expect(runtime.holdsDelivery(ORIGINAL)).toBe(false);
  });

  it('keeps a reply of any length across a restart, and shows a run it cannot read as failed', async () => {
    const dataDir = await makeDataDir();
    const sessionService = createMockSessionService();
    sessionService.replies[ORIGINAL].push('h'.repeat(150_000));
    sessionService.sessions.get(REVIEW).runtimeStatus = 'running';
    const first = await createRuntime({ dataDir, sessionService });
    first.runtime.start();
    await first.runtime.startRun(startInput());
    expect(await until(() => runOf(first.runtime)?.step === 'review')).toBe(true);
    first.runtime.stop();
    await first.runtime.flush();

    const file = path.join(dataDir, 'auto-review.json');
    const stored = JSON.parse(await fs.readFile(file, 'utf8'));
    stored.runs.push({ originalSessionID: 'ses_broken', reviewSessionID: 'ses_broken_review', directory: DIRECTORY, status: 'nonsense' });
    await fs.writeFile(file, JSON.stringify(stored));

    sessionService.sessions.get(REVIEW).runtimeStatus = 'idle';
    const second = await createRuntime({ dataDir, sessionService });
    second.runtime.start();
    expect(await until(() => sessionService.sends.length === 2)).toBe(true);
    expect(sessionService.sends[1].body.input.text).toHaveLength('Review this.\n\n'.length + 150_000);
    expect(second.runtime.snapshot().runs.find((run) => run.originalSessionID === 'ses_broken')).toMatchObject({
      status: 'failed',
      error: 'The saved review could not be read after a restart.',
    });
  });

  it('cuts a long failure to one line for the row', async () => {
    const { runtime, sessionService } = await createRuntime();
    sessionService.replies[ORIGINAL].push({ outcome: 'failed', error: 'e'.repeat(3_000) });
    runtime.start();
    await runtime.startRun(startInput());
    expect(await until(() => runOf(runtime)?.status === 'failed')).toBe(true);
    expect(runOf(runtime).error.length).toBe(500);
  });

  it('refuses a second running review of the same session and a session reviewing itself', async () => {
    const { runtime, sessionService } = await createRuntime();
    sessionService.sessions.get(ORIGINAL).runtimeStatus = 'running';
    runtime.start();
    await runtime.startRun(startInput());
    await expect(runtime.startRun(startInput())).rejects.toMatchObject({ status: 409 });
    await expect(runtime.startRun(startInput({ reviewSessionID: ORIGINAL }))).rejects.toBeInstanceOf(TypeError);
  });

  it('stops a running review on request, releases the queue and tells the clients', async () => {
    const { runtime, sessionService, broadcasts } = await createRuntime();
    sessionService.sessions.get(ORIGINAL).runtimeStatus = 'running';
    runtime.start();
    await runtime.startRun(startInput());
    expect(runtime.isRunning(ORIGINAL)).toBe(true);

    await runtime.removeRun(ORIGINAL);
    expect(runtime.isRunning(ORIGINAL)).toBe(false);
    expect(runtime.snapshot().runs).toEqual([]);
    expect(broadcasts.at(-1)).toMatchObject({
      type: 'openchamber:auto-review.updated',
      properties: { originalSessionID: ORIGINAL, directory: DIRECTORY, run: null },
    });
  });

  it('releases observation leases, unsubscribes hub listeners, and ignores events after stop()', async () => {
    const { runtime, sessionService, hub } = await createRuntime();
    sessionService.sessions.get(ORIGINAL).runtimeStatus = 'running';
    runtime.start();
    await runtime.startRun(startInput());

    expect(await until(() => hub.activeLeases.length >= 2)).toBe(true);
    for (const release of hub.activeLeases) expect(release).not.toHaveBeenCalled();

    runtime.stop();
    for (const release of hub.activeLeases) expect(release).toHaveBeenCalled();
    expect(hub.unsubscribed.event).toBe(1);
    expect(hub.unsubscribed.status).toBe(1);

    hub.emit({ type: 'session.status', sessionId: ORIGINAL, runtimeStatus: 'idle', activeRunId: null });
    await new Promise((r) => setTimeout(r, 20));
    expect(sessionService.sends).toHaveLength(0);

    expect(() => runtime.stop()).not.toThrow();
  });

  it('composes the real createOpenChamberSessionService and passes canonical admission and history parsing', async () => {
    const dataDir = await makeDataDir();
    const stateDataDir = path.join(dataDir, 'state');
    await fs.mkdir(stateDataDir, { recursive: true });
    const hostState = createHostSessionState({ dataDir: stateDataDir });
    await hostState.initialize();

    const workspaceDir = path.join(dataDir, 'repo');
    const agentDir = path.join(workspaceDir, '.agents');
    await fs.mkdir(agentDir, { recursive: true });

    await hostState.agentScopeStore.ensureWorkspace({
      hostProjectId: 'proj_1',
      projectId: 'proj_1',
      workspaceId: 'ws_1',
      projectDirectory: workspaceDir,
      workspaceDirectory: workspaceDir,
      agentDirectory: agentDir,
      name: 'Project',
    });

    const scope = (id) => ({
      sessionId: id,
      rootSessionId: id,
      projectId: 'proj_1',
      workspaceId: 'ws_1',
      cwd: workspaceDir,
      agentDirectoryId: 'agent-dir-1',
      agentDirectory: agentDir,
      displayPath: 'repo',
    });

    const requests = [];
    const historyPages = {
      [ORIGINAL]: {
        turns: [
          turn({ turnId: 'turn-handoff-tool', sessionId: ORIGINAL, status: 'completed', finishedAt: Date.now() + 5_000 }),
          turn({ turnId: 'turn-1', sessionId: ORIGINAL, status: 'completed', finishedAt: Date.now() + 10_000 }),
        ],
        messages: [
          message({ turnId: 'turn-handoff-tool', sessionId: ORIGINAL, role: 'assistant', parts: [{ type: 'tool_call', partId: 'tc_h', toolCallId: 'c_h', toolName: 'read', input: { path: 'a.ts' }, status: 'completed' }] }),
          message({ turnId: 'turn-1', sessionId: ORIGINAL, role: 'assistant', parts: [{ type: 'text', partId: 'p1', content: 'Handoff done' }] }),
        ],
      },
      [REVIEW]: {
        turns: [
          turn({ turnId: 'turn-review-tool', sessionId: REVIEW, status: 'completed', finishedAt: Date.now() + 15_000 }),
          turn({ turnId: 'turn-2', sessionId: REVIEW, status: 'completed', finishedAt: Date.now() + 20_000 }),
        ],
        messages: [
          message({ turnId: 'turn-review-tool', sessionId: REVIEW, role: 'assistant', parts: [{ type: 'tool_call', partId: 'tc_r', toolCallId: 'c_r', toolName: 'read', input: { path: 'a.ts' }, status: 'completed' }] }),
          message({ turnId: 'turn-2', sessionId: REVIEW, role: 'assistant', parts: [{ type: 'text', partId: 'p2', content: `Looks great.\n${FINAL_MARKER_CLEAN}` }] }),
        ],
      },
    };
    const service = {
      request: vi.fn(async (pathname, init = {}) => {
        requests.push({ pathname, method: init.method ?? 'GET', body: init.body, headers: init.headers });
        if (pathname.includes('/reopen')) {
          const id = decodeURIComponent(pathname.split('/').at(-2));
          return Response.json(runtimeSession({ sessionId: id, rootSessionId: id, projectId: 'proj_1', workspaceId: 'ws_1' }));
        }
        if (pathname.includes('/snapshot')) {
          const id = decodeURIComponent(pathname.split('/').at(-2));
          return Response.json(snapshotFixture([], [], { sessionId: id, rootSessionId: id, projectId: 'proj_1', workspaceId: 'ws_1', runtimeStatus: 'idle' }));
        }
        if (pathname.includes('/sessions?workspaceId=')) {
          return Response.json({
            items: [
              runtimeSession({ sessionId: ORIGINAL, rootSessionId: ORIGINAL, projectId: 'proj_1', workspaceId: 'ws_1', runtimeStatus: 'idle' }),
              runtimeSession({ sessionId: REVIEW, rootSessionId: REVIEW, projectId: 'proj_1', workspaceId: 'ws_1', runtimeStatus: 'idle' }),
            ],
            errors: [],
          });
        }
        if (pathname.endsWith('/runs')) {
          const id = decodeURIComponent(pathname.split('/').at(-2));
          const body = typeof init.body === 'string' ? JSON.parse(init.body) : (init.body ?? {});
          const runId = body.runId ?? `run-${requests.length}`;
          return Response.json({
            run: { runId, sessionId: id, status: 'running', createdAt: Date.now() },
          });
        }
        if (pathname.includes('/history')) {
          const id = decodeURIComponent(pathname.split('/').at(-2));
          const page = historyPages[id] ?? { turns: [], messages: [] };
          return Response.json(historyFixture(page.messages, page.turns, { sessionId: id }));
        }
        return Response.json({});
      }),
    };

    const sessionMetadataStore = {
      get: async () => null,
      getState: async () => null,
      setSessionMetadata: async () => ({ metadata: {}, revision: '1', changed: false }),
      updateSessionMetadata: async () => ({ metadata: {}, revision: '1', changed: false }),
    };
    const archiveStore = {
      isArchived: () => false,
      getState: async () => null,
      archive: async () => ({ archived: [], failedIds: [] }),
      unarchive: async () => ({ restored: [], failedIds: [] }),
    };

    const realSessionService = createOpenChamberSessionService({
      agentScopeStore: hostState.agentScopeStore,
      directCommandAdmissionStore: hostState.directCommandAdmissionStore,
      archiveStore,
      sessionMetadataStore,
      service,
      resolveWorkspaceScope: async () => scope('workspace'),
      resolveSessionScope: async (id) => scope(id),
      resolveHostSessionScope: async (id) => scope(id),
      registerSessionScope: async () => true,
      resolveAttachments: async () => [],
      capturePrompt: async (_scope, body) => body,
      beforeDispatch: async () => { },
      onPromptAccepted: async () => { },
    });

    const hub = createHub();
    const broadcasts = [];
    const ended = [];
    const runtime = createAutoReviewRuntime({
      globalEventHub: hub,
      sessionService: realSessionService,
      broadcastUiEvent: (e) => broadcasts.push(e),
      onRunEnded: (e) => ended.push(e),
      dataDir,
      quietMs: 0,
      retryDelayMs: () => 5,
    });
    runtimes.push(runtime);
    runtime.start();

    await runtime.startRun(startInput());
    expect(await until(() => runOf(runtime)?.status === 'clean')).toBe(true);

    const runRequests = requests.filter((r) => r.pathname.endsWith('/runs'));
    expect(runRequests.length).toBeGreaterThanOrEqual(2);
    for (const runReq of runRequests) {
      const body = JSON.parse(runReq.body);
      expect(body.request.input).toBeDefined();
      expect(body.request.options).toMatchObject({ providerId: null, modelId: null, agentId: null });
    }

    const db = new DatabaseSync(hostState.databasePath);
    const commandRows = db.prepare('SELECT * FROM host_direct_command WHERE session_id = ?').all(ORIGINAL);
    expect(commandRows.length).toBeGreaterThanOrEqual(1);
    expect(commandRows[0].state).toBe('accepted');
    expect(commandRows[0].command_id).toBeDefined();
    db.close();

    expect(await until(() => ended.length > 0)).toBe(true);
    expect(ended[0]).toMatchObject({ sessionId: ORIGINAL, status: 'clean' });

    await hostState.close();
  });
});
