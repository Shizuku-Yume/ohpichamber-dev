import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenChamberSessionService } from '../openchamber-sessions/routes.js';
import { createHostSessionState } from '../host/session-state.js';
import { runtimeSession, snapshot as snapshotFixture } from '../event-stream/canonical-test-fixtures.js';

import { trackedItemKey } from '../tracked-items/items.js';
import { changesBetween, createPrWatchRuntime, parsePullRequestUrl, PR_WATCH_SOURCE, registerPrWatchRoutes } from './runtime.js';

const SESSION = 'ses_agent';
const DIRECTORY = '/repo';
const URL_7 = 'https://github.com/acme/app/pull/7';
const URL_8 = 'https://github.com/acme/app/pull/8';

const temporaryDirectories = [];
const runtimes = [];

const createSignal = () => {
  const listeners = new Set();
  return {
    notify() { for (const listener of listeners) listener(); },
    until(check) {
      if (check()) return Promise.resolve(true);
      return new Promise((resolve) => {
        const listener = () => {
          if (!check()) return;
          listeners.delete(listener);
          resolve(true);
        };
        listeners.add(listener);
      });
    },
  };
};

afterEach(async () => {
  const stopping = runtimes.splice(0);
  for (const runtime of stopping) runtime.stop();
  await Promise.all(stopping.map((runtime) => runtime.flush()));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
  vi.useRealTimers();
});

const makeDataDir = async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openchamber-pr-watch-'));
  temporaryDirectories.push(directory);
  return directory;
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const pull = (extra = {}) => ({
  owner: 'acme', repo: 'app', number: 7, state: 'open', title: 'Fix it', headSha: 'a1',
  mergeableState: 'clean', checks: { state: 'pending' }, activity: 2, ...extra,
});

<<<<<<< HEAD
/** Canonical session service fixture. */
const createMockSessionService = () => {
  const sessions = new Map([[SESSION, { sessionId: SESSION, runtimeStatus: 'idle', workspaceId: 'ws-1' }]]);
  const sends = [];
  return {
    sessions,
    sends,
    async open(id) {
      const session = sessions.get(id);
      if (!session) { const err = new Error('not found'); err.statusCode = 404; throw err; }
      return { session: { ...session } };
    },
    async list(workspaceId) {
      return { items: Array.from(sessions.values()).filter((s) => !workspaceId || s.workspaceId === workspaceId) };
    },
    async send(sessionId, payload, commandKey) {
      sends.push({ sessionId, payload, commandKey });
      return { ok: true };
    },
  };
||||||| bc50ba56aa
/** OpenCode's session routes the runtime uses, with a log of what it admitted. */
const createOpenCode = () => {
  const state = { active: {}, admitted: [], seen: new Set() };
  const fetchImpl = vi.fn(async (url, init = {}) => {
    const { pathname } = new URL(url);
    if (pathname === '/api/session/active') return json({ data: state.active });
    if (pathname === '/api/session') return json({ data: [], cursor: {} });
    const match = pathname.match(/^\/api\/session\/([^/]+)\/synthetic$/);
    if (!match) return json({ error: 'not found' }, 404);
    const body = JSON.parse(init.body);
    if (state.seen.has(body.id)) return json({ error: 'conflict' }, 409);
    state.seen.add(body.id);
    state.admitted.push({ sessionID: decodeURIComponent(match[1]), ...body });
    return json({ data: { id: body.id } });
  });
  return { state, fetchImpl };
=======
/** OpenCode's session routes the runtime uses, with a log of what it admitted. */
const createOpenCode = () => {
  const signal = createSignal();
  const state = { active: {}, admitted: [], seen: new Set() };
  const fetchImpl = vi.fn(async (url, init = {}) => {
    const { pathname } = new URL(url);
    if (pathname === '/api/session/active') return json({ data: state.active });
    if (pathname === '/api/session') return json({ data: [], cursor: {} });
    const match = pathname.match(/^\/api\/session\/([^/]+)\/synthetic$/);
    if (!match) return json({ error: 'not found' }, 404);
    const body = JSON.parse(init.body);
    if (state.seen.has(body.id)) return json({ error: 'conflict' }, 409);
    state.seen.add(body.id);
    state.admitted.push({ sessionID: decodeURIComponent(match[1]), ...body });
    signal.notify();
    return json({ data: { id: body.id } });
  });
  return { state, fetchImpl, until: signal.until };
>>>>>>> upstream/main
};

/** The tracked-items service as the runtime sees it: interest in, changes out. */
const createTracked = (read = async () => ({ status: 'ok', pulls: [pull()] })) => {
  let listener = () => { };
  const tracked = {
    interest: new Map(),
    setServerInterest(_owner, items) { tracked.interest = new Map(items); },
    subscribe(next) { listener = next; return () => { }; },
  };
  return {
    tracked,
    readers: { sourceControl: vi.fn(read) },
    // A tracked-items answer; `requestedAt` is when the read behind it began.
    move: (state, requestedAt = Date.now() + 1, url = URL_7) => listener([{ key: trackedItemKey(parsePullRequestUrl(url)), state, requestedAt }]),
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

const createRuntime = async ({ dataDir, sessionService = createMockSessionService(), cleanupOnMerge = false, archived = false } = {}) => {
  const hub = createHub();
  const broadcasts = [];
  const signal = createSignal();
  const runtime = createPrWatchRuntime({
<<<<<<< HEAD
    sessionService,
    broadcastUiEvent: (event) => broadcasts.push(event),
||||||| bc50ba56aa
    buildOpenCodeUrl: (fetchPath) => `http://opencode.test${fetchPath}`,
    getOpenCodeAuthHeaders: () => ({}),
    broadcastUiEvent: (event) => broadcasts.push(event),
=======
    buildOpenCodeUrl: (fetchPath) => `http://opencode.test${fetchPath}`,
    getOpenCodeAuthHeaders: () => ({}),
    broadcastUiEvent: (event) => { broadcasts.push(event); signal.notify(); },
>>>>>>> upstream/main
    dataDir: dataDir ?? await makeDataDir(),
    readCleanupOnMerge: async () => cleanupOnMerge,
    isSessionArchived: async () => archived,
    quietMs: 0,
    retryDelayMs: () => 5,
  });
  runtimes.push(runtime);
<<<<<<< HEAD
  runtime.start(hub);
  return { runtime, sessionService, broadcasts, hub, emit: (event) => hub.emit(event) };
||||||| bc50ba56aa
  runtime.start({
    subscribeEvent(handler) { eventHandler = handler; return () => {}; },
    subscribeStatus() { return () => {}; },
  });
  return { runtime, openCode, broadcasts, emit: (payload) => eventHandler({ translated: () => [payload] }) };
=======
  runtime.start({
    subscribeEvent(handler) { eventHandler = handler; return () => {}; },
    subscribeStatus() { return () => {}; },
  });
  return { runtime, openCode, broadcasts, until: signal.until, emit: (payload) => eventHandler({ translated: () => [payload] }) };
>>>>>>> upstream/main
};

const until = async (check, timeoutMs = 2_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return check();
};

describe('parsePullRequestUrl', () => {
  it('reads GitHub, GitHub Enterprise and GitLab addresses, and nothing else', () => {
    expect(parsePullRequestUrl('https://github.com/acme/app/pull/7/files')).toMatchObject({ provider: 'github', owner: 'acme', repo: 'app', number: 7 });
    expect(parsePullRequestUrl('https://git.acme.com/team/app/pull/3')).toMatchObject({ provider: 'github', instance: 'git.acme.com', number: 3 });
    expect(parsePullRequestUrl('https://gitlab.com/group/sub/app/-/merge_requests/12')).toMatchObject({
      provider: 'gitlab', instance: 'https://gitlab.com', owner: 'group/sub', repo: 'app', number: 12,
    });
    expect(parsePullRequestUrl('https://github.com/acme/app/issues/7')).toBeNull();
    expect(parsePullRequestUrl('not a url')).toBeNull();
  });
});

describe('changesBetween', () => {
  const base = { state: 'open', headSha: 'a1', checks: 'pending', merge: 'clean', activity: 2, title: '' };
  it('names what an agent has to act on, and only once', () => {
    expect(changesBetween(null, base)).toEqual([]);
    expect(changesBetween(base, { ...base, checks: 'failure' })).toEqual(['checks-failed']);
    expect(changesBetween({ ...base, checks: 'success' }, { ...base, checks: 'success' })).toEqual([]);
    // The same outcome on a new push is news.
    expect(changesBetween({ ...base, checks: 'success' }, { ...base, headSha: 'b2', checks: 'success' })).toEqual(['checks-passed']);
    expect(changesBetween(base, { ...base, merge: 'dirty', activity: 3 })).toEqual(['conflict', 'activity']);
    expect(changesBetween(base, { ...base, state: 'merged' })).toEqual(['merged']);
  });
});

describe('registerPrWatchRoutes', () => {
  const request = { params: { sessionID: SESSION }, query: {} };
  const createRoutes = (runtime) => {
    const handlers = new Map();
    registerPrWatchRoutes({
      get(route, handler) { handlers.set(`GET ${route}`, handler); },
      delete(route, handler) { handlers.set(`DELETE ${route}`, handler); },
    }, runtime);
    const response = { status: vi.fn(() => response), json: vi.fn() };
    return { handlers, response };
  };

  it.each([
    [Object.assign(new Error('unreadable'), { status: 503 }), 503, 'unreadable'],
    [{ status: 400, message: 7 }, 400, 7],
    [Object.assign(() => {}, { status: 409, message: 'conflict' }), 409, 'conflict'],
    [{ status: '404', message: 'failed' }, 500, 'failed'],
    [{ status: 400.5 }, 500, 'Failed to load pull request watches'],
    ['unavailable', 500, 'Failed to load pull request watches'],
  ])('preserves error status and message for %j', async (error, status, message) => {
    const { handlers, response } = createRoutes({ load: async () => { throw error; } });
    await handlers.get('GET /api/pr-watch')(request, response);
    expect(response.status).toHaveBeenCalledWith(status);
    expect(response.json).toHaveBeenCalledWith({ error: message });
  });

  it('passes the supplied query value through to unwatch', async () => {
    const result = { watching: [], stopped: true };
    const unwatch = vi.fn(async () => result);
    const { handlers, response } = createRoutes({ unwatch });
    await handlers.get('DELETE /api/pr-watch/sessions/:sessionID')({ ...request, query: { url: ['invalid'] } }, response);
    expect(unwatch).toHaveBeenCalledWith(SESSION, ['invalid']);
    expect(response.json).toHaveBeenCalledWith(result);
  });
});

describe('createPrWatchRuntime', () => {
  it('follows the pull request and wakes the session once when it changes', async () => {
    const { tracked, readers, move } = createTracked();
<<<<<<< HEAD
    const { runtime, sessionService, broadcasts } = await createRuntime();
||||||| bc50ba56aa
    const { runtime, openCode, broadcasts } = await createRuntime();
=======
    const { runtime, openCode, broadcasts, until } = await createRuntime();
>>>>>>> upstream/main
    runtime.attach({ trackedItems: tracked, readers });

    const answer = await runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_7 });
    expect(answer.watching).toMatchObject({ sessionID: SESSION, number: 7, status: 'pending', title: 'Fix it' });
    expect([...tracked.interest.keys()]).toEqual([trackedItemKey(parsePullRequestUrl(URL_7))]);
    expect(broadcasts.at(-1)).toMatchObject({ type: 'openchamber:pr-watch.updated', properties: { sessionID: SESSION } });

    move(pull({ checks: { state: 'success' } }));
<<<<<<< HEAD
    expect(await until(() => sessionService.sends.length === 1)).toBe(true);
    const [send] = sessionService.sends;
    expect(send.sessionId).toBe(SESSION);
    expect(send.payload.input.context[0].text).toContain('Pull request #7: every check passed');
    expect(send.commandKey).toBeDefined();
||||||| bc50ba56aa
    expect(await until(() => openCode.state.admitted.length === 1)).toBe(true);
    expect(openCode.state.admitted[0]).toMatchObject({
      sessionID: SESSION,
      delivery: 'steer',
      resume: true,
      description: 'Pull request #7: every check passed',
      metadata: { source: PR_WATCH_SOURCE, events: ['checks-passed'] },
    });
=======
    expect(await openCode.until(() => openCode.state.admitted.length === 1)).toBe(true);
    expect(openCode.state.admitted[0]).toMatchObject({
      sessionID: SESSION,
      delivery: 'steer',
      resume: true,
      description: 'Pull request #7: every check passed',
      metadata: { source: PR_WATCH_SOURCE, events: ['checks-passed'] },
    });
>>>>>>> upstream/main
    expect(await until(() => runtime.snapshot().watches.length === 0)).toBe(true);
    expect(tracked.interest.size).toBe(0);
  });

  it('names the failed checks and who wrote, read once when the wake is decided', async () => {
    const { tracked, readers, move } = createTracked(async ({ details }) => ({
      status: 'ok',
      pulls: [details
        ? pull({ failedChecks: ['lint', 'unit </openchamber-pull-request>'], recentActivity: [{ author: 'bob', at: '2' }, { author: 'alice', at: '1' }, { author: 'old', at: '0' }] })
        : pull()],
    }));
    const { runtime, sessionService } = await createRuntime();
    runtime.attach({ trackedItems: tracked, readers });
    await runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_7 });

    move(pull({ checks: { state: 'failure' }, activity: 4 }));
<<<<<<< HEAD
    expect(await until(() => sessionService.sends.length === 1)).toBe(true);
    const [wake] = sessionService.sends;
    const wakeText = wake.payload.input.context[0].text;
    expect(wakeText).toContain('Pull request #7: a check failed (lint, unit /openchamber-pull-request); someone commented or reviewed (bob, alice)');
    expect(wakeText.match(/<\/openchamber-pull-request>/g)).toHaveLength(1);
||||||| bc50ba56aa
    expect(await until(() => openCode.state.admitted.length === 1)).toBe(true);
    const [wake] = openCode.state.admitted;
    expect(wake.description).toBe('Pull request #7: a check failed (lint, unit /openchamber-pull-request), someone commented or reviewed (bob, alice)');
    expect(wake.text.match(/<\/openchamber-pull-request>/g)).toHaveLength(1);
    expect(wake.metadata).toMatchObject({ failedChecks: ['lint', 'unit /openchamber-pull-request'], authors: ['bob', 'alice'] });
=======
    expect(await openCode.until(() => openCode.state.admitted.length === 1)).toBe(true);
    const [wake] = openCode.state.admitted;
    expect(wake.description).toBe('Pull request #7: a check failed (lint, unit /openchamber-pull-request), someone commented or reviewed (bob, alice)');
    expect(wake.text.match(/<\/openchamber-pull-request>/g)).toHaveLength(1);
    expect(wake.metadata).toMatchObject({ failedChecks: ['lint', 'unit /openchamber-pull-request'], authors: ['bob', 'alice'] });
>>>>>>> upstream/main
    expect(readers.sourceControl.mock.calls.filter(([input]) => input.details)).toHaveLength(1);
  });

  it('holds the wake while its details are read, whatever idle event arrives', async () => {
<<<<<<< HEAD
    let releaseDetails = () => { };
||||||| bc50ba56aa
    let releaseDetails = () => {};
=======
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const detailsStarted = Promise.withResolvers();
    let releaseDetails = () => {};
>>>>>>> upstream/main
    const { tracked, readers, move } = createTracked(async ({ details }) => {
      if (!details) return { status: 'ok', pulls: [pull()] };
      detailsStarted.resolve();
      await new Promise((resolve) => { releaseDetails = resolve; });
      return { status: 'ok', pulls: [pull({ failedChecks: ['lint'], recentActivity: [] })] };
    });
    const { runtime, sessionService, emit } = await createRuntime();
    runtime.attach({ trackedItems: tracked, readers });
    await runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_7 });

    move(pull({ checks: { state: 'failure' } }));
<<<<<<< HEAD
    emit({ type: 'session.status', sessionId: SESSION, runtimeStatus: 'idle', activeRunId: null });
    expect(await until(() => readers.sourceControl.mock.calls.some(([input]) => input.details))).toBe(true);
    emit({ type: 'session.status', sessionId: SESSION, runtimeStatus: 'idle', activeRunId: null });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(sessionService.sends).toEqual([]);
||||||| bc50ba56aa
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    expect(await until(() => readers.sourceControl.mock.calls.some(([input]) => input.details))).toBe(true);
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(openCode.state.admitted).toEqual([]);
=======
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await detailsStarted.promise;
    expect(readers.sourceControl.mock.calls.some(([input]) => input.details)).toBe(true);
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await vi.advanceTimersByTimeAsync(0);
    await runtime.flush();
    expect(openCode.state.admitted).toEqual([]);
>>>>>>> upstream/main

    vi.useRealTimers();
    releaseDetails();
<<<<<<< HEAD
    expect(await until(() => sessionService.sends.length === 1)).toBe(true);
    expect(sessionService.sends[0].payload.input.context[0].text).toContain('Pull request #7: a check failed (lint)');
||||||| bc50ba56aa
    expect(await until(() => openCode.state.admitted.length === 1)).toBe(true);
    expect(openCode.state.admitted[0].description).toBe('Pull request #7: a check failed (lint)');
=======
    expect(await openCode.until(() => openCode.state.admitted.length === 1)).toBe(true);
    expect(openCode.state.admitted[0].description).toBe('Pull request #7: a check failed (lint)');
>>>>>>> upstream/main
  });

  it('wakes without the details when they cannot be read', async () => {
    const { tracked, readers, move } = createTracked(async ({ details }) => {
      if (details) throw new Error('rate limited');
      return { status: 'ok', pulls: [pull()] };
    });
    const { runtime, sessionService } = await createRuntime();
    runtime.attach({ trackedItems: tracked, readers });
    await runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_7 });

    move(pull({ checks: { state: 'failure' } }));
<<<<<<< HEAD
    expect(await until(() => sessionService.sends.length === 1)).toBe(true);
    expect(sessionService.sends[0].payload.input.context[0].text).toContain('Pull request #7: a check failed');
||||||| bc50ba56aa
    expect(await until(() => openCode.state.admitted.length === 1)).toBe(true);
    expect(openCode.state.admitted[0].description).toBe('Pull request #7: a check failed');
=======
    expect(await openCode.until(() => openCode.state.admitted.length === 1)).toBe(true);
    expect(openCode.state.admitted[0].description).toBe('Pull request #7: a check failed');
>>>>>>> upstream/main
  });

  it('waits for a running session before it wakes it', async () => {
    const { tracked, readers, move } = createTracked();
    const { runtime, sessionService, emit } = await createRuntime();
    runtime.attach({ trackedItems: tracked, readers });
    await runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_7 });
    sessionService.sessions.get(SESSION).runtimeStatus = 'running';

    move(pull({ checks: { state: 'failure' } }));
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(sessionService.sends).toEqual([]);
    expect(runtime.snapshot().watches[0].status).toBe('waking');

    sessionService.sessions.get(SESSION).runtimeStatus = 'idle';
    emit({ type: 'session.status', sessionId: SESSION, runtimeStatus: 'idle', activeRunId: null });
    expect(await until(() => sessionService.sends.length === 1)).toBe(true);
  });

  it('ends quietly on a merge when the merged worktree is about to be archived', async () => {
    const { tracked, readers, move } = createTracked();
<<<<<<< HEAD
    const { runtime, sessionService } = await createRuntime({ cleanupOnMerge: true });
||||||| bc50ba56aa
    const { runtime, openCode } = await createRuntime({ cleanupOnMerge: true });
=======
    const { runtime, openCode, until } = await createRuntime({ cleanupOnMerge: true });
>>>>>>> upstream/main
    runtime.attach({ trackedItems: tracked, readers });
    await runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_7 });

    move(pull({ state: 'merged', checks: null }));
    expect(await until(() => runtime.snapshot().watches.length === 0)).toBe(true);
<<<<<<< HEAD
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sessionService.sends).toEqual([]);
||||||| bc50ba56aa
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(openCode.state.admitted).toEqual([]);
=======
    await runtime.flush();
    expect(openCode.state.admitted).toEqual([]);
>>>>>>> upstream/main
  });
  it('refuses what it cannot follow, with the reason', async () => {
    const { runtime } = await createRuntime();
    const attach = (read) => runtime.attach({ trackedItems: createTracked().tracked, readers: { sourceControl: read } });

    await expect(runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: 'https://example.com/x' })).rejects.toMatchObject({ status: 400 });
    attach(async () => ({ status: 'disconnected' }));
    await expect(runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_7 })).rejects.toThrow('no GitHub account');
    attach(async () => ({ status: 'ok', pulls: [] }));
    await expect(runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_7 })).rejects.toMatchObject({ status: 404 });
    attach(async () => ({ status: 'ok', pulls: [pull({ state: 'merged' })] }));
    await expect(runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_7 })).rejects.toMatchObject({ status: 409 });
    // A rate limit is not a refusal: the watch reads it later.
    attach(async () => ({ status: 'unavailable' }));
    await expect(runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_7 })).resolves.toMatchObject({ watching: { status: 'unknown' } });
  });

  it('delivers a wake left pending across a restart once, with the same id', async () => {
    const dataDir = await makeDataDir();
    const sessionService = createMockSessionService();
    sessionService.sessions.get(SESSION).runtimeStatus = 'running';
    const first = createTracked();
    const one = await createRuntime({ dataDir, sessionService });
    one.runtime.attach({ trackedItems: first.tracked, readers: first.readers });
    await one.runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_7 });
    first.move(pull({ checks: { state: 'failure' } }));
    expect(await one.until(() => one.runtime.snapshot().watches[0]?.status === 'waking')).toBe(true);
    one.runtime.stop();
    await one.runtime.flush();

<<<<<<< HEAD
    sessionService.sessions.get(SESSION).runtimeStatus = 'idle';
    const two = await createRuntime({ dataDir, sessionService });
    expect(await until(() => sessionService.sends.length === 1)).toBe(true);
    expect(await until(() => two.runtime.snapshot().watches.length === 0)).toBe(true);
    expect(sessionService.sends).toHaveLength(1);
||||||| bc50ba56aa
    openCode.state.active = {};
    const two = await createRuntime({ dataDir, openCode });
    expect(await until(() => openCode.state.admitted.length === 1)).toBe(true);
    expect(await until(() => two.runtime.snapshot().watches.length === 0)).toBe(true);
    expect(openCode.state.admitted).toHaveLength(1);
=======
    openCode.state.active = {};
    const two = await createRuntime({ dataDir, openCode });
    expect(await openCode.until(() => openCode.state.admitted.length === 1)).toBe(true);
    expect(await two.until(() => two.runtime.snapshot().watches.length === 0)).toBe(true);
    expect(openCode.state.admitted).toHaveLength(1);
>>>>>>> upstream/main
  });

  it('drops an answer to a read that began before the watch, so an older push does not end the wait', async () => {
    const { tracked, readers, move } = createTracked(async () => ({ status: 'ok', pulls: [pull({ headSha: 'b2' })] }));
    const { runtime, sessionService } = await createRuntime();
    runtime.attach({ trackedItems: tracked, readers });
    const before = Date.now() - 1_000;
    await runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_7 });

    move(pull({ headSha: 'a1', checks: { state: 'success' } }), before);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(sessionService.sends).toEqual([]);
    expect(runtime.snapshot().watches[0].status).toBe('pending');
  });

  it('wakes on a merge even when the pull request was never read before', async () => {
    const { tracked, readers, move } = createTracked(async () => ({ status: 'unavailable' }));
    const { runtime, sessionService } = await createRuntime();
    runtime.attach({ trackedItems: tracked, readers });
    await runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_7 });

    move(pull({ state: 'merged', checks: null }));
<<<<<<< HEAD
    expect(await until(() => sessionService.sends.length === 1)).toBe(true);
    expect(sessionService.sends[0].payload.input.context[0].text).toContain('merged');
||||||| bc50ba56aa
    expect(await until(() => openCode.state.admitted.length === 1)).toBe(true);
    expect(openCode.state.admitted[0].metadata.events).toEqual(['merged']);
=======
    expect(await openCode.until(() => openCode.state.admitted.length === 1)).toBe(true);
    expect(openCode.state.admitted[0].metadata.events).toEqual(['merged']);
>>>>>>> upstream/main
  });

  it('does not wake after a stop that lands while the wake is checking the session', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { tracked, readers, move } = createTracked();
    const sessionService = createMockSessionService();
    let release = () => { };
    const gate = new Promise((resolve) => { release = resolve; });
    const origOpen = sessionService.open;
    sessionService.open = vi.fn(async (id) => {
      await gate;
      return origOpen(id);
    });
    const { runtime } = await createRuntime({ sessionService });
    runtime.attach({ trackedItems: tracked, readers });
    await runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_7 });
    move(pull({ checks: { state: 'failure' } }));
<<<<<<< HEAD
    expect(await until(() => sessionService.open.mock.calls.length > 0)).toBe(true);
||||||| bc50ba56aa
    expect(await until(() => openCode.fetchImpl.mock.calls.some(([url]) => new URL(url).pathname === '/api/session/active'))).toBe(true);
=======
    await vi.waitFor(() => expect(openCode.fetchImpl.mock.calls.some(([url]) => new URL(url).pathname === '/api/session/active')).toBe(true));
>>>>>>> upstream/main

    await runtime.unwatch(SESSION);
    release();
<<<<<<< HEAD
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(sessionService.sends).toEqual([]);
||||||| bc50ba56aa
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(openCode.state.admitted).toEqual([]);
=======
    await vi.runAllTimersAsync();
    await runtime.flush();
    await vi.runAllTimersAsync();
    expect(openCode.state.admitted).toEqual([]);
>>>>>>> upstream/main
  });

  it('keeps an idle event that arrives while a wake is in flight, and wakes once the session is free', async () => {
    const probeStarted = Promise.withResolvers();
    const { tracked, readers, move } = createTracked();
    const sessionService = createMockSessionService();
    let release = () => { };
    let gate = new Promise((resolve) => { release = resolve; });
<<<<<<< HEAD
    const origOpen = sessionService.open;
    sessionService.open = vi.fn(async (id) => {
      await gate;
      return origOpen(id);
||||||| bc50ba56aa
    const fetchImpl = openCode.fetchImpl;
    openCode.fetchImpl = vi.fn(async (url, init) => {
      if (new URL(url).pathname === '/api/session/active') {
        await gate;
        // The first answer was taken while the turn ran; the next is current.
        const answer = json({ data: openCode.state.active });
        openCode.state.active = {};
        return answer;
      }
      return fetchImpl(url, init);
=======
    const fetchImpl = openCode.fetchImpl;
    openCode.fetchImpl = vi.fn(async (url, init) => {
      if (new URL(url).pathname === '/api/session/active') {
        probeStarted.resolve();
        await gate;
        // The first answer was taken while the turn ran; the next is current.
        const answer = json({ data: openCode.state.active });
        openCode.state.active = {};
        return answer;
      }
      return fetchImpl(url, init);
>>>>>>> upstream/main
    });
    sessionService.sessions.get(SESSION).runtimeStatus = 'running';
    const { runtime, emit } = await createRuntime({ sessionService });
    runtime.attach({ trackedItems: tracked, readers });
    await runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_7 });
    move(pull({ checks: { state: 'failure' } }));
<<<<<<< HEAD
    expect(await until(() => sessionService.open.mock.calls.length > 0)).toBe(true);
||||||| bc50ba56aa
    expect(await until(() => openCode.fetchImpl.mock.calls.length > 0)).toBe(true);
=======
    await probeStarted.promise;
    expect(openCode.fetchImpl.mock.calls.length).toBeGreaterThan(0);
>>>>>>> upstream/main

<<<<<<< HEAD
    emit({ type: 'session.status', sessionId: SESSION, runtimeStatus: 'idle', activeRunId: null });
    await new Promise((resolve) => setTimeout(resolve, 10));
    sessionService.sessions.get(SESSION).runtimeStatus = 'idle';
||||||| bc50ba56aa
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await new Promise((resolve) => setTimeout(resolve, 10));
=======
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
>>>>>>> upstream/main
    gate = Promise.resolve();
    release();
<<<<<<< HEAD
    expect(await until(() => sessionService.sends.length === 1)).toBe(true);
||||||| bc50ba56aa
    expect(await until(() => openCode.state.admitted.length === 1)).toBe(true);
=======
    expect(await openCode.until(() => openCode.state.admitted.length === 1)).toBe(true);
>>>>>>> upstream/main
  });

  it('stops on request, and when the session is deleted', async () => {
    const { tracked, readers } = createTracked();
    const { runtime, emit, until } = await createRuntime();
    runtime.attach({ trackedItems: tracked, readers });
    await runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_7 });
    await expect(runtime.unwatch(SESSION)).resolves.toEqual({ watching: [], stopped: true });
    expect(tracked.interest.size).toBe(0);

    await runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_7 });
    emit({ type: 'session.deleted', deletedSessionIds: [SESSION] });
    expect(await until(() => runtime.snapshot().watches.length === 0)).toBe(true);
  });
<<<<<<< HEAD

  it('releases observation leases, unsubscribes hub listeners, and ignores events after stop()', async () => {
    const { runtime, sessionService, hub } = await createRuntime();
    runtime.attach({ trackedItems: createTracked().tracked, readers: { sourceControl: vi.fn(async () => ({ status: 'ok', pulls: [pull()] })) } });
    await runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_7 });

    expect(await until(() => hub.activeLeases.length >= 1)).toBe(true);
    for (const release of hub.activeLeases) expect(release).not.toHaveBeenCalled();

    runtime.stop();
    for (const release of hub.activeLeases) expect(release).toHaveBeenCalled();
    expect(hub.unsubscribed.event).toBe(1);
    expect(hub.unsubscribed.status).toBe(1);

    hub.emit({ type: 'session.status', sessionId: SESSION, runtimeStatus: 'idle', activeRunId: null });
    await new Promise((r) => setTimeout(r, 20));
    expect(sessionService.sends).toHaveLength(0);

    expect(() => runtime.stop()).not.toThrow();
  });

  it('composes the real createOpenChamberSessionService and proves the wake payload passes canonical admission', async () => {
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
            items: [runtimeSession({ sessionId: SESSION, rootSessionId: SESSION, projectId: 'proj_1', workspaceId: 'ws_1', runtimeStatus: 'idle' })],
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
    const runtime = createPrWatchRuntime({
      sessionService: realSessionService,
      broadcastUiEvent: (e) => broadcasts.push(e),
      dataDir,
      quietMs: 0,
      retryDelayMs: () => 5,
    });
    runtimes.push(runtime);
    runtime.start(hub);

    let listener = () => { };
    const tracked = {
      setServerInterest: vi.fn(),
      subscribe(next) { listener = next; return () => { }; },
    };
    const readers = {
      sourceControl: vi.fn(async () => ({
        status: 'ok',
        pulls: [pull()],
      })),
    };
    runtime.attach({ trackedItems: tracked, readers });

    await runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_7 });

    listener([{
      key: trackedItemKey(parsePullRequestUrl(URL_7)),
      state: pull({ checks: { state: 'success' } }),
      requestedAt: Date.now() + 10,
    }]);

    expect(await until(() => requests.some((r) => r.pathname.endsWith('/runs')))).toBe(true);

    const runReq = requests.find((r) => r.pathname.endsWith('/runs'));
    expect(runReq).toBeDefined();
    const body = JSON.parse(runReq.body);
    expect(body.request.input.context[0].text).toContain('Pull request #7: every check passed');
    expect(body.request.options).toMatchObject({ providerId: null, modelId: null, agentId: null });

    const db = new DatabaseSync(hostState.databasePath);
    const commandRows = db.prepare('SELECT * FROM host_direct_command WHERE session_id = ?').all(SESSION);
    expect(commandRows.length).toBeGreaterThanOrEqual(1);
    expect(commandRows[0].state).toBe('accepted');
    expect(commandRows[0].command_id).toBeDefined();
    db.close();

    await hostState.close();
  });
||||||| bc50ba56aa
=======

  const readEach = async ({ pulls }) => ({ status: 'ok', pulls: pulls.map(({ number }) => pull({ number })) });

  it('waits on several pull requests of one session, and each wakes it on its own', async () => {
    const { tracked, readers, move } = createTracked(readEach);
    const openCode = createOpenCode();
    const admit = openCode.fetchImpl;
    openCode.fetchImpl = vi.fn(async (url, init) => {
      const response = await admit(url, init);
      // An admitted wake starts a turn.
      if (new URL(url).pathname.endsWith('/synthetic')) openCode.state.active = { [SESSION]: { type: 'busy' } };
      return response;
    });
    const { runtime, broadcasts, emit } = await createRuntime({ openCode });
    runtime.attach({ trackedItems: tracked, readers });
    await runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_7 });
    await runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_8 });
    // Watching one again renews it alone.
    await runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_7 });
    expect(runtime.snapshot().watches.map((watch) => watch.number)).toEqual([8, 7]);
    expect(broadcasts.at(-1).properties.watches.map((watch) => watch.number)).toEqual([8, 7]);
    expect(tracked.interest.size).toBe(2);

    move(pull({ checks: { state: 'failure' } }));
    move(pull({ number: 8, checks: { state: 'success' } }), undefined, URL_8);
    expect(await until(() => openCode.state.admitted.length === 1)).toBe(true);
    // The second wake waits for the turn the first one started.
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(openCode.state.admitted).toHaveLength(1);

    openCode.state.active = {};
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    expect(await until(() => openCode.state.admitted.length === 2)).toBe(true);
    expect(openCode.state.admitted.map((wake) => wake.metadata.url).sort()).toEqual([URL_7, URL_8]);
    expect(await until(() => runtime.snapshot().watches.length === 0)).toBe(true);
  });

  it('steers a second wake into the first one\'s turn when OpenCode reports it busy late, and loses neither', async () => {
    const { tracked, readers, move } = createTracked(readEach);
    // OpenCode never shows the turn the first wake started as running by the
    // time the second wake asks, so the second one is admitted right away.
    const { runtime, openCode, until } = await createRuntime();
    runtime.attach({ trackedItems: tracked, readers });
    await runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_7 });
    await runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_8 });

    move(pull({ checks: { state: 'failure' } }));
    expect(await openCode.until(() => openCode.state.admitted.length === 1)).toBe(true);
    move(pull({ number: 8, checks: { state: 'success' } }), undefined, URL_8);
    expect(await openCode.until(() => openCode.state.admitted.length === 2)).toBe(true);

    expect(openCode.state.admitted.map((wake) => wake.metadata.url)).toEqual([URL_7, URL_8]);
    expect(openCode.state.admitted.every((wake) => wake.delivery === 'steer' && wake.resume === true)).toBe(true);
    expect(new Set(openCode.state.admitted.map((wake) => wake.id)).size).toBe(2);
    expect(await until(() => runtime.snapshot().watches.length === 0)).toBe(true);
  });

  it('gives up one pull request\'s wake without stranding the next one of the session', async () => {
    const { tracked, readers, move } = createTracked(readEach);
    const openCode = createOpenCode();
    const admit = openCode.fetchImpl;
    openCode.fetchImpl = vi.fn(async (url, init) => {
      if (new URL(url).pathname.endsWith('/synthetic') && JSON.parse(init.body).metadata.url === URL_7) return json({ error: 'broken' }, 500);
      return admit(url, init);
    });
    const { runtime, until } = await createRuntime({ openCode });
    runtime.attach({ trackedItems: tracked, readers });
    await runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_7 });
    await runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_8 });

    move(pull({ checks: { state: 'success' } }));
    move(pull({ number: 8, checks: { state: 'success' } }), undefined, URL_8);
    expect(await openCode.until(() => openCode.state.admitted.length === 1)).toBe(true);
    expect(openCode.state.admitted[0].metadata.url).toBe(URL_8);
    expect(await until(() => runtime.snapshot().watches.length === 0)).toBe(true);
  });

  it('stops one pull request of the session, or all of them', async () => {
    const { tracked, readers } = createTracked(readEach);
    const { runtime } = await createRuntime();
    runtime.attach({ trackedItems: tracked, readers });
    await runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_7 });
    await runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_8 });

    await expect(runtime.unwatch(SESSION, URL_8)).resolves.toMatchObject({ stopped: true, watching: [{ number: 7 }] });
    expect(tracked.interest.size).toBe(1);
    await expect(runtime.unwatch(SESSION, 'https://example.com/x')).rejects.toMatchObject({ status: 400 });

    await runtime.watch({ sessionID: SESSION, directory: DIRECTORY, url: URL_8 });
    await expect(runtime.unwatch(SESSION)).resolves.toEqual({ watching: [], stopped: true });
    expect(tracked.interest.size).toBe(0);
  });
>>>>>>> upstream/main
});
