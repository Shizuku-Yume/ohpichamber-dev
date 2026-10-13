import { describe, expect, it } from 'vitest';

import { createSessionWorkRuntime } from './runtime.js';

const scope = { sessionId: 'ses_1', rootSessionId: 'ses_1', projectId: 'project-1', workspaceId: 'workspace-1', cwd: '/repo' };
const endpoint = { url: 'https://jev.test', model: 'jev', headers: {} };
const messages = [
  { messageId: 'assistant-1', role: 'assistant', createdAt: 2, completedAt: 3, providerId: 'provider-1', modelId: 'model-1', parts: [{ type: 'text', content: 'Ready.' }] },
  { messageId: 'user-1', role: 'user', createdAt: 1, parts: [{ type: 'text', content: 'Please start the implementation.' }] },
];

const makeRuntime = ({ ask, updateMetadata = async () => ({ changed: true, metadata: {} }) } = {}) => createSessionWorkRuntime({
  sessionService: {
    open: async () => ({ session: { sessionId: 'ses_1' } }),
    history: async () => ({ messages, nextCursor: null }),
  },
  resolveSessionScope: async () => scope,
  getSettings: () => ({ enabled: true, autoOpen: true, reviewOffer: false }),
  classifierEndpoint: async () => endpoint,
  jev: { ask: ask || (async () => ({ answers: { change: { noul: 1 }, toward_change: { noul: 1 } } })) },
  readMetadata: async () => ({}),
  updateMetadata,
});

describe('session-work canonical consumer', () => {
  it('opens work only from a canonical user message and a positive classifier answer', async () => {
    const writes = [];
    const runtime = makeRuntime({ updateMetadata: async (...args) => { writes.push(args); return { changed: true, metadata: {} }; } });

    runtime.processCanonicalEvent({ type: 'message.created', sessionId: 'ses_1', messageId: 'new-user-1', role: 'user', createdAt: 3, parts: [{ type: 'text', content: 'Please start the implementation.' }] }, scope);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toBe('ses_1');
    expect(writes[0][2]).toEqual({ directory: '/repo' });
    runtime.stop();
  });

  it('ignores a user event from another session scope', async () => {
    let asks = 0;
    const runtime = makeRuntime({ ask: async () => { asks += 1; return { answers: { change: { noul: 1 } } }; } });

    runtime.processCanonicalEvent({ type: 'message.created', sessionId: 'ses_1', messageId: 'new-user-1', role: 'user', parts: [{ type: 'text', content: 'Nope.' }] }, { ...scope, sessionId: 'ses_other' });
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(asks).toBe(0);
    runtime.stop();
  });
});
