import { CanonicalEventSchema, EntityIdSchema, SessionSnapshotSchema } from '@openchamber/agent-contract';

const SESSION_COOLDOWN_DURATION_MS = 2000;
const SESSION_STATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SESSION_STATE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const LIVE = new Set(['running', 'awaiting_approval', 'awaiting_input']);

export const createSessionRuntime = ({ broadcastEvent, now = Date.now }) => {
  if (typeof broadcastEvent !== 'function') throw new TypeError('Host UI broadcaster is required');
  const phases = new Map();
  const cooldowns = new Map();
  const states = new Map();
  const attention = new Map();
  const pending = new Map();
  let activeCount = 0;
  let disposed = false;

  const getAttention = (sessionId) => {
    if (disposed) return null;
    let state = attention.get(sessionId);
    if (!state) {
      state = { needsAttention: false, lastUserMessageAt: null, lastStatusChangeAt: now(), viewedByClients: new Set(), status: 'unavailable' };
      attention.set(sessionId, state);
    }
    return state;
  };
  const publishState = (sessionId) => {
    const state = states.get(sessionId);
    if (!state) return;
    broadcastEvent({ type: 'openchamber:session-status', properties: {
      sessionId, status: state.status, activeRunId: state.activeRunId, timestamp: state.lastUpdateAt,
      metadata: state.metadata, needsAttention: attention.get(sessionId)?.needsAttention ?? false,
    } });
  };
  const setPhase = (sessionId, phase) => {
    const prior = phases.get(sessionId);
    if (prior?.phase === phase || (phase === 'cooldown' && prior?.phase !== 'busy')) return;
    clearTimeout(cooldowns.get(sessionId)); cooldowns.delete(sessionId);
    if ((prior?.phase === 'busy') !== (phase === 'busy')) activeCount += phase === 'busy' ? 1 : -1;
    phases.set(sessionId, { phase, updatedAt: now() });
    if (phase === 'cooldown') {
      const timer = setTimeout(() => { cooldowns.delete(sessionId); if (phases.get(sessionId)?.phase === 'cooldown') setPhase(sessionId, 'idle'); }, SESSION_COOLDOWN_DURATION_MS);
      cooldowns.set(sessionId, timer);
      timer.unref?.();
    }
    broadcastEvent({ type: 'openchamber:session-activity', properties: { sessionId, phase } });
  };
  const updateState = (sessionId, status, activeRunId, eventId, metadata = {}, hydrate = false) => {
    const prior = states.get(sessionId);
    const observed = getAttention(sessionId);
    if (!observed) return;
    const wasAttention = observed.needsAttention;
    if (!hydrate && LIVE.has(observed.status) && status === 'idle'
      && observed.lastUserMessageAt !== null && observed.viewedByClients.size === 0) observed.needsAttention = true;
    observed.status = status; observed.lastStatusChangeAt = now();
    states.set(sessionId, { status, activeRunId, lastUpdateAt: now(), lastEventId: eventId, metadata });
    if (!prior || prior.status !== status || prior.activeRunId !== activeRunId
      || prior.metadata.reason !== metadata.reason || wasAttention !== observed.needsAttention) publishState(sessionId);
    if (LIVE.has(status)) setPhase(sessionId, 'busy');
    else if (!hydrate && status === 'idle' && phases.get(sessionId)?.phase === 'busy') setPhase(sessionId, 'cooldown');
    else if (hydrate || status !== 'idle' || phases.get(sessionId)?.phase !== 'cooldown') setPhase(sessionId, 'idle');
  };
  const getPending = (sessionId) => {
    let entry = pending.get(sessionId);
    if (!entry) { entry = { approvals: new Map(), questions: new Map() }; pending.set(sessionId, entry); }
    return entry;
  };
  const settle = (sessionId, kind, requestId) => {
    const entry = pending.get(sessionId);
    if (!entry) return;
    entry[kind].delete(requestId);
    if (entry.approvals.size === 0 && entry.questions.size === 0) pending.delete(sessionId);
  };
  const removeSession = (sessionId) => {
    if (phases.get(sessionId)?.phase === 'busy') activeCount -= 1;
    clearTimeout(cooldowns.get(sessionId)); cooldowns.delete(sessionId);
    phases.delete(sessionId); states.delete(sessionId); attention.delete(sessionId); pending.delete(sessionId);
  };
  const requireScope = (scope) => {
    if (!scope?.projectId || !scope?.workspaceId || !scope?.rootSessionId) throw new Error('Host session scope is required');
  };
  const markUserMessageSent = (sessionId, at = now()) => {
    EntityIdSchema.parse(sessionId);
    const state = getAttention(sessionId);
    if (state) state.lastUserMessageAt = at;
  };
  const applySnapshot = (input, scope) => {
    if (disposed) return;
    requireScope(scope);
    const snapshot = SessionSnapshotSchema.parse(input);
    const session = snapshot.session;
    if (session.projectId !== scope.projectId || session.workspaceId !== scope.workspaceId || session.rootSessionId !== scope.rootSessionId) {
      throw new Error('Host session scope mismatch');
    }
    pending.delete(session.sessionId);
    for (const request of snapshot.approvals) if (request.status === 'pending') getPending(session.sessionId).approvals.set(request.approvalId, request);
    for (const request of snapshot.questions) if (request.status === 'pending') getPending(session.sessionId).questions.set(request.questionId, request);
    updateState(session.sessionId, session.runtimeStatus, session.activeRunId, snapshot.cursor, {}, true);
  };
  const processCanonicalEvent = (input, scope) => {
    if (disposed) return;
    requireScope(scope);
    const event = CanonicalEventSchema.parse(input);
    const sessionId = event.sessionId;
    const eventId = `${event.epoch}:${event.sequence}`;
    if (event.type === 'session.deleted') { for (const id of event.deletedSessionIds) removeSession(id); return; }
    if (event.type === 'session.status') { updateState(sessionId, event.runtimeStatus, event.activeRunId, eventId); return; }
    if (event.type === 'run.started') { updateState(sessionId, 'running', event.runId, eventId); return; }
    if (['run.completed', 'run.failed', 'run.cancelled'].includes(event.type)) {
      const current = states.get(sessionId);
      if (current?.activeRunId && current.activeRunId !== event.runId) return;
      pending.delete(sessionId); updateState(sessionId, 'idle', null, eventId); return;
    }
    if (event.type === 'message.created' && event.role === 'user') { markUserMessageSent(sessionId, event.timestamp); return; }
    if (event.type === 'approval.requested' || event.type === 'approval.resolved') {
      if (event.approval.sessionId !== sessionId) throw new Error('Canonical approval scope mismatch');
      if (event.type === 'approval.requested') getPending(sessionId).approvals.set(event.approval.approvalId, event.approval);
      else settle(sessionId, 'approvals', event.approval.approvalId);
      return;
    }
    if (event.type === 'question.requested' || event.type === 'question.resolved') {
      if (event.question.sessionId !== sessionId) throw new Error('Canonical question scope mismatch');
      if (event.type === 'question.requested') getPending(sessionId).questions.set(event.question.questionId, event.question);
      else settle(sessionId, 'questions', event.question.questionId);
    }
  };
  const getSessionStateSnapshot = () => Object.fromEntries([...states].filter(([, state]) => now() - state.lastUpdateAt <= SESSION_STATE_MAX_AGE_MS)
    .map(([id, state]) => [id, { status: state.status, activeRunId: state.activeRunId, lastUpdateAt: state.lastUpdateAt, metadata: state.metadata }]));
  const getPendingBlockingRequestsSnapshot = () => Object.fromEntries([...pending].map(([id, entry]) => [id,
    { approvals: [...entry.approvals.values()], questions: [...entry.questions.values()] }]));
  const attentionSnapshot = (state) => ({ needsAttention: state.needsAttention, lastUserMessageAt: state.lastUserMessageAt,
    lastStatusChangeAt: state.lastStatusChangeAt, status: state.status, isViewed: state.viewedByClients.size > 0 });
  const cleanupInterval = setInterval(() => {
    for (const [id, state] of states) if (now() - state.lastUpdateAt > SESSION_STATE_MAX_AGE_MS) removeSession(id);
    for (const [id, state] of attention) if (now() - state.lastStatusChangeAt > SESSION_STATE_MAX_AGE_MS) attention.delete(id);
  }, SESSION_STATE_CLEANUP_INTERVAL_MS);
  cleanupInterval.unref?.();

  return {
    applySnapshot,
    processCanonicalEvent,
    getSessionStateSnapshot,
    getPendingBlockingRequestsSnapshot,
    getSessionState: (sessionId) => states.get(sessionId) ?? null,
    getSessionActivitySnapshot: () => Object.fromEntries([...phases].map(([id, entry]) => [id, { type: entry.phase }])),
    getActiveSessionCount: () => activeCount,
    getSessionAttentionSnapshot: () => Object.fromEntries([...attention].filter(([, state]) => now() - state.lastStatusChangeAt <= SESSION_STATE_MAX_AGE_MS)
      .map(([id, state]) => [id, attentionSnapshot(state)])),
    getSessionAttentionState(sessionId) { const state = attention.get(sessionId); return state ? attentionSnapshot(state) : null; },
    markUserMessageSent,
    markSessionViewed(sessionId, clientId) {
      const state = getAttention(sessionId);
      if (!state) return;
      state.viewedByClients.add(clientId);
      if (state.needsAttention) { state.needsAttention = false; publishState(sessionId); }
    },
    markSessionUnviewed(sessionId, clientId) { attention.get(sessionId)?.viewedByClients.delete(clientId); },
    interruptBusySessionsAfterRestart() {
      const sessionIds = [...states].filter(([, state]) => LIVE.has(state.status)).map(([id]) => id);
      pending.clear();
      for (const sessionId of sessionIds) {
        updateState(sessionId, 'unavailable', null, `host-restart-${now()}`, { reason: 'agent-service-restart' });
        broadcastEvent({ type: 'openchamber:session-interrupted', properties: { sessionId, reason: 'agent-service-restart' } });
      }
      for (const sessionId of phases.keys()) if (phases.get(sessionId)?.phase === 'cooldown') setPhase(sessionId, 'idle');
      return { sessionIds };
    },
    dispose() {
      disposed = true; clearInterval(cleanupInterval);
      for (const timer of cooldowns.values()) clearTimeout(timer);
      cooldowns.clear(); phases.clear(); states.clear(); attention.clear(); pending.clear(); activeCount = 0;
    },
  };
};
