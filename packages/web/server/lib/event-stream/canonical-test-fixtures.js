export const scope = { projectId: 'project', workspaceId: 'workspace', cwd: '/private/workspace', rootSessionId: 'session', agentDirectoryId: 'agent', agentDirectory: '/private/agent' };
export const runtimeSession = (overrides = {}) => ({ sessionId: 'session', projectId: 'project', workspaceId: 'workspace', displayPath: '.',
  rootSessionId: 'session', createdAt: 1, updatedAt: 2, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, ...overrides });
export const turn = (overrides = {}) => ({ turnId: 'turn', sessionId: 'session', runId: 'run', status: 'completed', userMessageId: 'user',
  assistantMessageIds: ['assistant'], startedAt: 1, finishedAt: 2, ...overrides });
export const message = (overrides = {}) => ({ messageId: 'assistant', sessionId: 'session', turnId: 'turn', role: 'assistant', createdAt: 2,
  parts: [{ type: 'text', partId: 'text', content: 'Final searchable answer' }], ...overrides });
export const history = (messages = [message()], turns = [turn()], overrides = {}) => ({ sessionId: 'session',
  branch: { branchId: 'branch', branchVersion: '1', leafMessageId: messages.at(-1)?.messageId ?? null }, messages, turns, nextCursor: null, ...overrides });
export const snapshot = (messages = [], turns = [], sessionOverrides = {}) => {
  const selection = history(messages, turns);
  const session = runtimeSession(sessionOverrides);
  return { session, cursor: `${session.epoch}:${session.headSequence}`, activeRun: null, branch: selection.branch, messages, turns,
    window: { firstTurnId: turns[0]?.turnId ?? null, lastTurnId: turns.at(-1)?.turnId ?? null,
      firstMessageId: messages[0]?.messageId ?? null, lastMessageId: messages.at(-1)?.messageId ?? null, hasEarlier: false },
    approvals: [], questions: [], requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' } };
};
export const event = (sequence, fields = {}) => Object.fromEntries(Object.entries({ type: 'part.delta', sessionId: 'session', epoch: 'epoch', sequence: String(sequence),
  timestamp: sequence, ...(fields.type && fields.type !== 'part.delta' ? {} : { partId: 'text', delta: String(sequence) }), ...fields }).filter(([, value]) => value !== undefined));
export const encodeEvent = (record) => `id: ${record.epoch}:${record.sequence}\nevent: ${record.type}\ndata: ${JSON.stringify(record)}\n\n`;
export const streamBoundary = () => {
  let controller;
  let cancelled = false;
  const calls = [];
  const body = new ReadableStream({ start(value) { controller = value; }, cancel() { cancelled = true; } });
  return {
    calls,
    service: { async request(path, init) { calls.push({ path, init }); return path.endsWith('/snapshot')
      ? Response.json(snapshot()) : new Response(body, { headers: { 'content-type': 'text/event-stream' } }); } },
    push(text) { controller.enqueue(new TextEncoder().encode(text)); },
    end() { controller.close(); },
    cancelled: () => cancelled,
  };
};
export const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
