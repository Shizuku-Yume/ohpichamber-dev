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

  it('skips malformed pins and text parts without losing valid context', async () => {
    const { synthetic, fetchMock } = fakeOpenCode();
    const upstream = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (input, init) => {
      if (new URL(input).pathname.endsWith('/message/msg_a')) {
        return json({ data: { content: [null, 1, {}, { type: 'text', text: 123 }, { type: 'text', text: ' Old answer ' }] } });
      }
      return upstream(input, init);
    });
    const metadata = pinnedMetadata();
    metadata.openchamber.context_obligatory_messages.push(
      null, {}, { id: 1, createdAt: 3, role: 'user' },
      { id: 'bad_time', createdAt: '3', role: 'user' },
      { id: 'bad_role', createdAt: 3, role: 'system' },
    );
    const { runtime } = makeRuntime({ readSessionMetadata: async () => metadata, persistContextCursor: vi.fn(async () => undefined) });

    await runtime.processPayload(compactionEvent(), '/repo');

    expect(synthetic).toHaveLength(1);
    expect(synthetic[0].text).toContain('Old answer');
    expect(synthetic[0].text).toContain('Keep this rule');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('bad_'))).toBe(false);
  });

  it('preserves a truthy compaction id without promising a string', async () => {
    const { synthetic, fetchMock } = fakeOpenCode();
    const upstream = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (input, init) => {
      if (new URL(input).pathname.endsWith('/message')) {
        return json({ data: [{ id: 42, type: 'compaction', status: 'completed' }], cursor: {} });
      }
      return upstream(input, init);
    });
    const persistContextCursor = vi.fn(async () => undefined);
    const { runtime } = makeRuntime({ readSessionMetadata: async () => pinnedMetadata(), persistContextCursor });

    await runtime.processPayload(compactionEvent(), '/repo');

    expect(synthetic).toHaveLength(1);
    expect(persistContextCursor).toHaveBeenCalledWith('ses_1', '/repo', {
      openchamber: { context_obligatory_last_compaction_message_id: 42 },
    });
  });
});
