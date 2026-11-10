import { describe, expect, it } from 'vitest';

import { createSessionWorkRuntime } from './runtime.js';

const scope = { sessionId: 'ses_1', rootSessionId: 'ses_1', projectId: 'project-1', workspaceId: 'workspace-1', agentDirectoryId: 'agent-1', cwd: '/repo' };
const endpoint = { url: 'https://jev.test', model: 'jev', headers: {} };
const rootSession = { sessionId: 'ses_1', projectId: 'project-1', workspaceId: 'workspace-1', displayPath: '.', rootSessionId: 'ses_1', createdAt: 1, updatedAt: 2, epoch: 'epoch_1', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' } };
const childSession = { ...rootSession, sessionId: 'ses_child', rootSessionId: 'ses_1' };
const historyPage = (sessionId, pending = true) => {
  const messages = [
    { messageId: 'user-1', sessionId, turnId: 'turn-1', role: 'user', createdAt: 1, parts: [{ partId: 'user-text', type: 'text', content: 'Implement the bounded fix.' }] },
    { messageId: 'assistant-1', sessionId, turnId: 'turn-1', role: 'assistant', createdAt: 2, providerId: 'provider-1', modelId: 'model-1', parts: [{ partId: 'answer-text', type: 'text', content: 'Ready.' }] },
  ];
  const turns = [{ turnId: 'turn-1', sessionId, runId: 'run-1', status: 'completed', userMessageId: 'user-1', assistantMessageIds: ['assistant-1'], startedAt: 1, finishedAt: 3 }];
  if (pending) {
    messages.push({ messageId: 'new-user-1', sessionId, turnId: 'turn-2', role: 'user', createdAt: 4, parts: [{ partId: 'new-user-text', type: 'text', content: 'Please start the implementation.' }] });
    turns.push({ turnId: 'turn-2', sessionId, runId: 'run-2', status: 'running', userMessageId: 'new-user-1', assistantMessageIds: [], startedAt: 4 });
  }
  return { sessionId, branch: { branchId: 'branch-1', branchVersion: '1', leafMessageId: messages.at(-1).messageId }, messages, turns, nextCursor: null };
};

<<<<<<< HEAD
const makeRuntime = ({ ask, session = rootSession, sessionScope = { ...scope, sessionId: session.sessionId }, pending = true,
  classifierEndpoint = async (workspaceId) => { expect(workspaceId).toBe(scope.workspaceId); return endpoint; },
  updateMetadata = async () => ({ changed: true, metadata: {} }) } = {}) => createSessionWorkRuntime({
  sessionService: {
    open: async () => ({ session }),
    history: async () => historyPage(session.sessionId, pending),
  },
  resolveSessionScope: async () => sessionScope,
  getSettings: () => ({ enabled: true, autoOpen: true, reviewOffer: false }),
  classifierEndpoint,
  jev: { ask: ask || (async () => ({ answers: { change: { noul: 1 }, toward_change: { noul: 1 } } })) },
  readMetadata: async () => ({}),
  updateMetadata,
=======
const makeRuntime = ({
  metadata = {},
  answers = {},
  askError = null,
  settings = {},
  endpoint = ENDPOINT,
  lineage = null,
  isSessionArchived = async () => false,
} = {}) => {
  const records = new Map([['ses_1', metadata]]);
  const readMetadata = vi.fn(async (id) => records.get(id) ?? {});
  const updateMetadata = vi.fn(async (id, decide) => {
    const current = records.get(id) ?? {};
    const patch = decide(current);
    if (!patch) return { metadata: current, changed: false };
    const merged = mergeMetadataPatch(current, patch);
    records.set(id, merged);
    return { metadata: merged, changed: true };
  });
  const jev = { ask: vi.fn(async () => { if (askError) throw askError; return { answers, ms: 5 }; }) };
  let time = 100;
  const runtime = createSessionWorkRuntime({
    buildOpenCodeUrl: (fetchPath) => `http://opencode.test${fetchPath}`,
    getOpenCodeAuthHeaders: () => ({}),
    getSettings: () => ({ enabled: true, reviewOffer: true, ...settings }),
    classifierEndpoint: async () => endpoint,
    jev,
    readMetadata,
    updateMetadata,
    isSessionArchived,
    chatRoots: ['/home/me/.config/openchamber/chats'],
    lineage,
    now: () => time++,
    openRetryDelaysMs: [5, 5],
  });
  return { runtime, jev, readMetadata, updateMetadata, records };
};

const restored = { type: 'session.unarchived', properties: { sessionID: 'ses_1' } };
const busy = { type: 'session.status', properties: { sessionID: 'ses_1', status: { type: 'busy' } } };
const workState = (records) => records.get('ses_1').openchamber?.work?.state;

const sent = (id = 'msg_new', text = 'Now fix the header') => ({
  type: 'message.updated',
  properties: { sessionID: 'ses_1', info: { id, role: 'user', text, time: { created: 50 } } },
>>>>>>> bc50ba56a
});

const userEvent = (sessionId = 'ses_1') => ({ type: 'message.created', sessionId, messageId: 'new-user-1', role: 'user', createdAt: 4,
  parts: [{ partId: 'new-user-text', type: 'text', content: 'Please start the implementation.' }] });

<<<<<<< HEAD
describe('session-work canonical consumer', () => {
  it('opens work only from a canonical user message and a workspace-scoped positive classifier answer', async () => {
    const writes = [];
    const workspaces = [];
    const runtime = makeRuntime({
      classifierEndpoint: async (workspaceId) => { workspaces.push(workspaceId); return workspaceId === scope.workspaceId ? endpoint : null; },
      ask: async (request, selectedEndpoint) => {
        expect(selectedEndpoint).toBe(endpoint);
        expect(request.state.history).toEqual([{ role: 'user', text: 'Implement the bounded fix.' }, { role: 'assistant', text: 'Ready.' }]);
        return { answers: { change: { noul: 1 } } };
      },
      updateMetadata: async (...args) => { writes.push(args); return { changed: true, metadata: {} }; },
=======
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('session work decisions', () => {
  it('keeps an assist field Jev did not answer, and drops only a clear no', () => {
    expect(decideAssist({})).toEqual({ recap: true, suggestion: true });
    expect(decideAssist({ recap: { noul: 0.2 }, next_step: { noul: 0.1 } })).toEqual({ recap: false, suggestion: false });
    expect(decideAssist({ recap: { noul: 0.6 }, next_step: { noul: 0.7 } })).toEqual({ recap: true, suggestion: true });
  });
});

describe('session work runtime: a message was sent', () => {
  it('opens the session on a sent message without asking Jev', async () => {
    stubOpenCode();
    const { runtime, jev, records } = makeRuntime();

    runtime.processPayload(sent());
    await settle(() => records.get('ses_1').openchamber);

    expect(jev.ask).not.toHaveBeenCalled();
    expect(records.get('ses_1')).toMatchObject({ openchamber: { work: { state: 'open', openedBy: 'auto' } } });
  });

  it('opens the session on a message with only an attachment or attached context', async () => {
    stubOpenCode();
    const { runtime, records } = makeRuntime();

    runtime.processPayload(sent('msg_files', ''));
    await settle(() => records.get('ses_1').openchamber);

    expect(records.get('ses_1')).toMatchObject({ openchamber: { work: { state: 'open', openedBy: 'auto' } } });
  });

  it('opens the session on a shell command the user ran', async () => {
    stubOpenCode();
    const { runtime, records } = makeRuntime();

    runtime.processPayload({ type: 'session.shell.started', id: 'evt_shell', created: 50, properties: { sessionID: 'ses_1' } });
    await settle(() => records.get('ses_1').openchamber);

    expect(records.get('ses_1')).toMatchObject({ openchamber: { work: { state: 'open', openedBy: 'auto' } } });
  });

  it('reopens a session closed before the message was sent, and keeps one closed after it', async () => {
    stubOpenCode();
    // `sent()` is created at 50.
    const reopened = makeRuntime({ metadata: { openchamber: { work: { state: 'done', doneAt: 40 } } } });
    reopened.runtime.processPayload(sent());
    await settle(() => reopened.records.get('ses_1').openchamber.work.state === 'open');
    expect(reopened.records.get('ses_1').openchamber.work.state).toBe('open');

    const kept = makeRuntime({ metadata: { openchamber: { work: { state: 'done', doneAt: 60 } } } });
    kept.runtime.processPayload(sent());
    await settle(() => kept.updateMetadata.mock.calls.length > 0);
    expect(kept.records.get('ses_1').openchamber.work.state).toBe('done');
  });

  it('reads nothing for a session already in work, and handles a message once', async () => {
    const fetchMock = stubOpenCode();
    const open = makeRuntime({ metadata: { openchamber: { work: { state: 'open' } } } });
    open.runtime.processPayload(sent());
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(open.updateMetadata).not.toHaveBeenCalled();

    const fresh = makeRuntime();
    fresh.runtime.processPayload(sent('msg_x'));
    fresh.runtime.processPayload(sent('msg_x'));
    await settle(() => fresh.updateMetadata.mock.calls.length > 0);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fresh.updateMetadata).toHaveBeenCalledTimes(1);
  });

  it('skips a known subsession without reading it, and learns one it had to read', async () => {
    const lineage = createSessionLineage();
    lineage.remember('ses_1', 'ses_parent');
    const fetchMock = stubOpenCode();
    const known = makeRuntime({ lineage });
    known.runtime.processPayload(sent());
    expect(await known.runtime.evaluateTurnEnd({ sessionId: 'ses_1', directory: '/repo', assist: { recap: true, suggestion: true } })).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(known.jev.ask).not.toHaveBeenCalled();
    vi.unstubAllGlobals();

    const learning = createSessionLineage();
    stubOpenCode({ session: { parentID: 'ses_parent' } });
    const unknown = makeRuntime({ lineage: learning });
    await unknown.runtime.evaluateTurnEnd({ sessionId: 'ses_1', directory: '/repo', assist: { recap: true, suggestion: true } });
    expect(learning.isChild('ses_1')).toBe(true);
  });

  it('opens nothing with In work off, or in a child, review, /btw, scheduled, or chat session', async () => {
    for (const setup of [
      { runtime: { settings: { enabled: false } } },
      { session: { parentID: 'ses_parent' } },
      { session: { metadata: { openchamber: { kind: 'review', originalSessionID: 'ses_0' } } } },
      { session: { metadata: { openchamber: { kind: 'btw', originalSessionID: 'ses_0' } } } },
      { session: { metadata: { openchamber: { kind: 'scheduled' } } } },
      { session: { location: { directory: '/home/me/.config/openchamber/chats/2026-09-27/hello' } } },
    ]) {
      stubOpenCode({ session: setup.session });
      const { runtime, updateMetadata } = makeRuntime(setup.runtime);
      runtime.processPayload(sent());
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(updateMetadata).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    }
  });
});

describe('session work runtime: recovering an open that failed', () => {
  it('opens after a failed metadata read, session read or write, with no second delivery', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const fail of ['metadata', 'session', 'write']) {
      const fetchMock = stubOpenCode();
      const { runtime, readMetadata, updateMetadata, records } = makeRuntime();
      if (fail === 'metadata') readMetadata.mockRejectedValueOnce(new Error('store unreadable'));
      if (fail === 'session') fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
      if (fail === 'write') updateMetadata.mockRejectedValueOnce(new Error('write failed'));

      runtime.processPayload(sent('msg_retry'));
      await settle(() => workState(records) === 'open');
      expect(workState(records), fail).toBe('open');
      vi.unstubAllGlobals();
    }
  });

  it('gives up after its bounded retries', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubOpenCode();
    const { runtime, updateMetadata } = makeRuntime();
    updateMetadata.mockRejectedValue(new Error('write failed'));

    runtime.processPayload(sent('msg_retry'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    // The first try and one per retry delay.
    expect(updateMetadata).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenLastCalledWith(expect.stringContaining('gave up'), 'write failed');
  });

  it('does not retry a session OpenCode no longer has', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ _tag: 'SessionNotFoundError', sessionID: 'ses_1', message: 'Session not found' }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);
    const { runtime } = makeRuntime();

    runtime.processPayload(sent('msg_gone'));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('opens a session a message reached while archived once it is restored', async () => {
    stubOpenCode();
    let archived = true;
    const { runtime, updateMetadata, records } = makeRuntime({ isSessionArchived: async () => archived });

    runtime.processPayload(sent('msg_archived'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(updateMetadata).not.toHaveBeenCalled();

    archived = false;
    runtime.processPayload(restored);
    await settle(() => workState(records) === 'open');
    expect(workState(records)).toBe('open');

    // A later restore owes nothing more.
    runtime.processPayload(restored);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(updateMetadata).toHaveBeenCalledTimes(1);
  });

  it('keeps a session closed when the user closed it after the message, even once restored', async () => {
    stubOpenCode();
    let archived = true;
    const { runtime, records } = makeRuntime({ isSessionArchived: async () => archived });

    runtime.processPayload(sent('msg_archived'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    // The user marks it done after the message was sent (`sent()` is created at 50).
    records.set('ses_1', { openchamber: { work: { state: 'done', doneAt: 60 } } });
    archived = false;
    runtime.processPayload(restored);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(workState(records)).toBe('done');
  });

  it('opens nothing on a restore once In work was turned off', async () => {
    stubOpenCode();
    let archived = true;
    const settings = { enabled: true };
    const { runtime, records } = makeRuntime({ settings, isSessionArchived: async () => archived });
    runtime.processPayload(sent('msg_archived'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    archived = false;
    settings.enabled = false;
    runtime.processPayload(restored);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(workState(records)).toBeUndefined();
  });

  it('writes nothing once stopped while it read the archive state', async () => {
    stubOpenCode();
    let answerArchived;
    const { runtime, updateMetadata } = makeRuntime({
      isSessionArchived: () => new Promise((resolve) => { answerArchived = resolve; }),
    });
    runtime.processPayload(sent('msg_stop'));
    await settle(() => answerArchived !== undefined);
    runtime.stop();
    answerArchived(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(updateMetadata).not.toHaveBeenCalled();
  });

  it('does not start another turn when it retries: the current turn still gets its hint', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubOpenCode();
    const { runtime, jev, updateMetadata, records } = makeRuntime({ settings: { enabled: true, reviewOffer: true } });
    let answer;
    jev.ask.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    updateMetadata.mockRejectedValueOnce(new Error('write failed'));

    runtime.processPayload(sent('msg_turn'));
    runtime.processPayload(busy);
    const pending = runtime.evaluateTurnEnd({ sessionId: 'ses_1', directory: '/repo', assist: { recap: false, suggestion: false } });
    await settle(() => answer !== undefined && workState(records) === 'open');
    expect(workState(records)).toBe('open');

    answer({ answers: { review_ready: { noul: 0.9 } }, ms: 5 });
    await pending;
    expect(records.get('ses_1').openchamber.reviewOffer.at).toBeTypeOf('number');
  });
});

describe('session work runtime: a turn ended', () => {
  it('asks only the assist and review questions for a session not in work, and never opens it', async () => {
    stubOpenCode();
    const { runtime, jev, records } = makeRuntime({
      answers: { recap: { noul: 0.9 }, next_step: { noul: 0.1 } },
>>>>>>> bc50ba56a
    });
    runtime.processCanonicalEvent(userEvent(), scope);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(workspaces).toEqual([scope.workspaceId]);
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toBe('ses_1');
    expect(writes[0][2]).toEqual({ directory: '/repo' });
    runtime.stop();
  });

  it('skips a strict RuntimeSession child even when its user event is otherwise eligible', async () => {
    let asks = 0;
    const runtime = makeRuntime({ session: childSession, ask: async () => { asks += 1; return { answers: { change: { noul: 1 } } }; } });
    runtime.processCanonicalEvent({ ...userEvent('ses_child'), parts: [] }, { ...scope, sessionId: 'ses_child' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(asks).toBe(0);
    runtime.stop();
  });

  it('ignores a user event from another session scope', async () => {
    let asks = 0;
    const runtime = makeRuntime({ ask: async () => { asks += 1; return { answers: { change: { noul: 1 } } }; } });
    runtime.processCanonicalEvent(userEvent(), { ...scope, sessionId: 'ses_other' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(asks).toBe(0);
    runtime.stop();
  });

  it('resolves the Host workspace before classifying a canonical completed turn', async () => {
    const workspaces = [];
    const writes = [];
    const runtime = makeRuntime({ pending: false,
      classifierEndpoint: async (workspaceId) => { workspaces.push(workspaceId); return workspaceId === scope.workspaceId ? endpoint : null; },
      ask: async (request, selectedEndpoint) => {
        expect(selectedEndpoint).toBe(endpoint);
        expect(request.state).toEqual({ history: [], request: 'Implement the bounded fix.', answer: 'Ready.' });
        return { answers: { change: { noul: 1 }, recap: { noul: 1 } } };
      },
      updateMetadata: async (...args) => { writes.push(args); return { changed: true, metadata: {} }; },
    });
    expect(await runtime.evaluateTurnEnd({ sessionId: scope.sessionId, assist: { recap: true, suggestion: false } })).toEqual({ recap: true, suggestion: true });
    expect(workspaces).toEqual([scope.workspaceId]);
    expect(writes).toHaveLength(1);
    expect(writes[0][2]).toEqual({ directory: scope.cwd });
    runtime.stop();
  });

  it('never resolves an unscoped endpoint when the Host session scope is missing', async () => {
    const workspaces = [];
    const runtime = makeRuntime({ sessionScope: null,
      classifierEndpoint: async (workspaceId) => { workspaces.push(workspaceId); return endpoint; },
    });
    runtime.processCanonicalEvent(userEvent(), scope);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await runtime.evaluateTurnEnd({ sessionId: scope.sessionId, assist: { recap: true, suggestion: false } })).toBeNull();
    expect(workspaces).toEqual([]);
    runtime.stop();
  });
});
