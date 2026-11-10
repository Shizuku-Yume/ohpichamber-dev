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
});
