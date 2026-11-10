import { describe, expect, it } from 'vitest';

import { createContextObligatoryRuntime } from './runtime.js';

const scope = { sessionId: 'ses_1', rootSessionId: 'ses_1', projectId: 'project-1', workspaceId: 'workspace-1', cwd: '/repo/app' };
const metadataWithPin = { openchamber: { context_obligatory_messages: [{ id: 'msg-1', createdAt: 1, role: 'user' }] } };
const rootSession = { sessionId: 'ses_1', projectId: 'project-1', workspaceId: 'workspace-1', displayPath: '.', rootSessionId: 'ses_1', createdAt: 1, updatedAt: 2, epoch: 'epoch_1', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' } };
const childSession = { ...rootSession, sessionId: 'ses_child', rootSessionId: 'ses_1' };
const compacted = { type: 'session.compacted', sessionId: 'ses_1', epoch: 'epoch_1', sequence: '1', timestamp: 3, compactionId: 'compaction-1', tokensBefore: 10, completedAt: 3 };

const createHarness = (metadata = metadataWithPin, session = rootSession) => {
  const sent = [];
  const patches = [];
  const sessionService = {
    open: async () => ({ session }),
    history: async () => ({
      messages: [
        { messageId: 'msg-1', sessionId: session.sessionId, role: 'user', createdAt: 1, parts: [{ type: 'text', content: 'Pinned instruction' }] },
        { messageId: 'assistant-1', sessionId: session.sessionId, role: 'assistant', createdAt: 2, providerId: 'provider-1', modelId: 'model-1', parts: [{ type: 'text', content: 'Answer' }] },
      ],
      nextCursor: null,
    }),
    send: async (sessionId, request) => { sent.push({ sessionId, request }); },
  };
  const runtime = createContextObligatoryRuntime({
    sessionService,
    resolveSessionScope: async () => ({ ...scope, sessionId: session.sessionId }),
    readSessionMetadata: async () => metadata,
    persistContextCursor: async (...args) => patches.push(args),
  });
  return { runtime, sent, patches };
};

<<<<<<< HEAD
describe('context-obligatory canonical consumer', () => {
  it('restores pinned context through a canonical synthetic prompt after compaction', async () => {
    const { runtime, sent, patches } = createHarness();
    await runtime.processCanonicalEvent(compacted, scope);
    expect(sent).toEqual([{
      sessionId: 'ses_1',
      request: {
        input: { text: '', attachments: [], context: [{ kind: 'synthetic', text: expect.stringContaining('Pinned instruction') }] },
        options: { providerId: 'provider-1', modelId: 'model-1', agentId: null, variant: null, reasoningEffort: null },
      },
    }]);
    expect(patches).toEqual([['ses_1', '/repo/app', { openchamber: { context_obligatory_last_compaction_id: 'compaction-1' } }]]);
=======
const compactionEvent = () => ({ type: 'session.compacted', properties: { sessionID: 'ses_1' } });

const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

/** A v2 OpenCode holding one finished compaction and two pinned messages. */
const fakeOpenCode = (sessionCreated = 1, parentID = undefined) => {
  const synthetic = [];
  const fetchMock = vi.fn(async (url, init) => {
    const path = new URL(url).pathname;
    if (path === '/api/session/ses_1') return json({ data: { id: 'ses_1', ...(parentID ? { parentID } : {}), time: { created: sessionCreated } } });
    if (path === '/api/session/ses_1/message') {
      return json({
        data: [
          { id: 'msg_compact', type: 'compaction', status: 'completed', reason: 'auto', summary: 'S', recent: '', time: { created: 5 } },
          { id: 'msg_a', type: 'assistant', content: [{ type: 'text', text: 'Old answer' }], time: { created: 2 } },
        ],
        cursor: {},
      });
    }
    if (path === '/api/session/ses_1/message/msg_u') return json({ data: { id: 'msg_u', type: 'user', text: 'Keep this rule', time: { created: 1 } } });
    if (path === '/api/session/ses_1/message/msg_a') {
      return json({ data: { id: 'msg_a', type: 'assistant', content: [{ type: 'reasoning', text: 'x' }, { type: 'text', text: 'Old answer' }], time: { created: 2 } } });
    }
    if (path === '/api/session/ses_1/synthetic') {
      synthetic.push(JSON.parse(init.body));
      return json({ data: {} });
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { synthetic, fetchMock };
};

const pinnedMetadata = (extra = {}) => ({
  openchamber: {
    context_obligatory_messages: [
      { id: 'msg_a', createdAt: 2, role: 'assistant' },
      { id: 'msg_u', createdAt: 1, role: 'user' },
    ],
    ...extra,
  },
});

afterEach(() => {
  while (runtimes.length > 0) runtimes.pop().stop();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('context obligatory runtime', () => {
  it('re-sends pinned messages after a finished compaction and records the cursor', async () => {
    const { synthetic } = fakeOpenCode();
    const persistContextCursor = vi.fn(async () => undefined);
    const { runtime } = makeRuntime({ readSessionMetadata: async () => pinnedMetadata(), persistContextCursor });

    await runtime.processPayload(compactionEvent(), '/repo');

    expect(synthetic).toHaveLength(1);
    expect(synthetic[0].resume).toBe(false);
    const text = synthetic[0].text;
    expect(text.indexOf('Keep this rule')).toBeGreaterThan(-1);
    expect(text.indexOf('Keep this rule')).toBeLessThan(text.indexOf('Old answer'));
    expect(text).not.toContain('\nx\n');
    expect(persistContextCursor).toHaveBeenCalledWith('ses_1', '/repo', {
      openchamber: { context_obligatory_last_compaction_message_id: 'msg_compact' },
    });
>>>>>>> bc50ba56a
  });

  it('skips a strict RuntimeSession child after compaction', async () => {
    const { runtime, sent, patches } = createHarness(metadataWithPin, childSession);
    await runtime.processCanonicalEvent({ ...compacted, sessionId: 'ses_child' }, { ...scope, sessionId: 'ses_child' });
    expect(sent).toHaveLength(0);
    expect(patches).toHaveLength(0);
  });

  it('does not inject or advance the cursor when no pinned context exists', async () => {
    const { runtime, sent, patches } = createHarness({ openchamber: {} });
    await runtime.processCanonicalEvent(compacted, scope);
    expect(sent).toHaveLength(0);
    expect(patches).toHaveLength(0);
  });

  it('keeps restoring inherited explicitly owned pins in a root fork', async () => {
    const { synthetic } = fakeOpenCode(100);
    const metadata = pinnedMetadata();
    metadata.openchamber.context_obligatory_messages[0].sessionID = 'ses_parent';
    const { runtime } = makeRuntime({ readSessionMetadata: async () => metadata, persistContextCursor: vi.fn(async () => undefined) });

    await runtime.processPayload(compactionEvent(), '/repo');

    expect(synthetic).toHaveLength(1);
    expect(synthetic[0].text).toContain('Keep this rule');
    expect(synthetic[0].text).toContain('Old answer');
  });

  it('keeps restoring legacy pins older than a root fork', async () => {
    const { synthetic } = fakeOpenCode(100);
    const { runtime } = makeRuntime({ readSessionMetadata: async () => pinnedMetadata(), persistContextCursor: vi.fn(async () => undefined) });

    await runtime.processPayload(compactionEvent(), '/repo');

    expect(synthetic).toHaveLength(1);
    expect(synthetic[0].text).toContain('Old answer');
    expect(synthetic[0].text).toContain('Keep this rule');
  });

  it('never re-injects into a child session', async () => {
    const { synthetic } = fakeOpenCode(1, 'ses_parent');
    const readSessionMetadata = vi.fn(async () => pinnedMetadata());
    const { runtime } = makeRuntime({ readSessionMetadata, persistContextCursor: vi.fn(async () => undefined) });

    await runtime.processPayload(compactionEvent(), '/repo');

    expect(synthetic).toHaveLength(0);
    expect(readSessionMetadata).not.toHaveBeenCalled();
  });

  it('keeps restoring root pins when the session has no creation time', async () => {
    const { synthetic } = fakeOpenCode(null);
    const metadata = pinnedMetadata();
    metadata.openchamber.context_obligatory_messages[1].sessionID = 'ses_1';
    const { runtime } = makeRuntime({ readSessionMetadata: async () => metadata, persistContextCursor: vi.fn(async () => undefined) });

    await runtime.processPayload(compactionEvent(), '/repo');

    expect(synthetic).toHaveLength(1);
    expect(synthetic[0].text).toContain('Keep this rule');
    expect(synthetic[0].text).toContain('Old answer');
  });
});
