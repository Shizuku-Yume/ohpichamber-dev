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

afterEach(async () => {
  const stopping = runtimes.splice(0);
  for (const runtime of stopping) runtime.stop();
  await Promise.all(stopping.map((runtime) => runtime.flush()));
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
      return { ok: true };
    },
    async history(sessionId) {
      ensure(sessionId);
      const page = historyPages[sessionId];
      return { turns: [...page.turns], messages: [...page.messages] };
    },
  };
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
    globalEventHub: hub,
    sessionService,
    broadcastUiEvent: (event) => broadcasts.push(event),
    onRunEnded: (run) => ended.push(run),
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

const until = async (check, timeoutMs = 2_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return check();
};

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

    expect(await until(() => runOf(runtime)?.status === 'limit', 5_000)).toBe(true);
    expect(runOf(runtime).round).toBe(MAX_ROUNDS);
    expect(sessionService.sends.filter((s) => s.sessionId === REVIEW)).toHaveLength(MAX_ROUNDS + 1);
  });

  it('waits for a running session before it sends, so nothing steers into a live turn', async () => {
    const { runtime, sessionService, emit } = await createRuntime();
    sessionService.sessions.get(ORIGINAL).runtimeStatus = 'running';
    runtime.start();
    await runtime.startRun(startInput());
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(sessionService.sends).toEqual([]);

    sessionService.sessions.get(ORIGINAL).runtimeStatus = 'idle';
    emit({ type: 'session.status', sessionId: ORIGINAL, runtimeStatus: 'idle', activeRunId: null });
    expect(await until(() => sessionService.sends.length === 1)).toBe(true);
  });

  it('stops the run when the user stops the turn it waits on, and says so without notifying', async () => {
    const { runtime, sessionService, ended } = await createRuntime();
    sessionService.replies[ORIGINAL].push({ outcome: 'interrupted', text: 'Half a handoff' });
    runtime.start();
    await runtime.startRun(startInput());

    expect(await until(() => runOf(runtime)?.status === 'stopped')).toBe(true);
    expect(sessionService.sends).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 20));
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
    expect(await until(() => sessionService.sends.length === 3)).toBe(true);
    expect(sessionService.sends[1].commandKey).toBe(initialKey);
    expect(sessionService.sends.map((s) => s.body.input.text)).toEqual([
      'Write a handoff.',
      'Write a handoff.',
      'Review this.\n\nThe handoff.',
    ]);
  });

  // Reverts and routeSend removed in OMP architecture

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

  it('composes the real createOhPiChamberSessionService and passes canonical admission and history parsing', async () => {
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
