/** Native canonical streaming lifecycle tracking. */
import { create } from 'zustand';
import type { Message, SessionRuntimeStatus } from '@openchamber/agent-contract';
import type { State } from './types';
import { countSyncPerformance } from './performance-diagnostics';

type StreamPhase = 'streaming' | 'completed';
type MessageStreamState = { phase: StreamPhase; startedAt: number; lastUpdateAt: number; completedAt?: number };
type StreamingStore = { streamingMessageIds: Map<string, string | null>; messageStreamStates: Map<string, MessageStreamState> };
export const useStreamingStore = create<StreamingStore>()(() => ({ streamingMessageIds: new Map(), messageStreamStates: new Map() }));
export function resetStreamingState(): void { useStreamingStore.setState({ streamingMessageIds: new Map(), messageStreamStates: new Map() }); }
const STREAMING_HEARTBEAT_MS = 1000;
const isLiveStatus = (status: SessionRuntimeStatus | undefined): boolean => status === 'running' || status === 'awaiting_approval' || status === 'awaiting_input';
const findTrailingAssistantMessage = (messages: Message[] | undefined): Message | null => {
  if (!messages) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    countSyncPerformance('streamingMessagesVisited');
    if (messages[index].role === 'user') return null;
    if (messages[index].role === 'assistant') return messages[index];
  }
  return null;
};
const completeStreamingMessage = (sessionId: string, messageId: string, now: number, ids: Map<string, string | null>, states: Map<string, MessageStreamState>): boolean => {
  let changed = false;
  if (ids.get(sessionId) !== null) { ids.set(sessionId, null); changed = true; }
  const existing = states.get(messageId);
  if (existing?.phase === 'streaming') { states.set(messageId, { ...existing, phase: 'completed', completedAt: now }); changed = true; }
  return changed;
};
const updateOne = (state: State, sessionId: string, now: number, ids: Map<string, string | null>, states: Map<string, MessageStreamState>): boolean => {
  if (!isLiveStatus(state.session_status[sessionId])) return ids.get(sessionId) ? completeStreamingMessage(sessionId, ids.get(sessionId)!, now, ids, states) : false;
  const message = findTrailingAssistantMessage(state.message[sessionId]);
  if (!message) return ids.get(sessionId) ? completeStreamingMessage(sessionId, ids.get(sessionId)!, now, ids, states) : false;
  const turn = state.snapshot[sessionId]?.turns.find((candidate) => candidate.turnId === message.turnId);
  if (turn && (turn.status === 'completed' || turn.status === 'failed' || turn.status === 'cancelled')) {
    const activeId = ids.get(sessionId);
    return activeId ? completeStreamingMessage(sessionId, activeId, now, ids, states) : false;
  }
  const previous = ids.get(sessionId);
  let changed = previous !== message.messageId;
  if (previous && previous !== message.messageId) completeStreamingMessage(sessionId, previous, now, ids, states);
  ids.set(sessionId, message.messageId);
  const existing = states.get(message.messageId);
  if (!existing || existing.phase !== 'streaming') {
    states.set(message.messageId, { phase: 'streaming', startedAt: existing?.startedAt ?? now, lastUpdateAt: now });
    changed = true;
  } else if (now - existing.lastUpdateAt >= STREAMING_HEARTBEAT_MS) {
    states.set(message.messageId, { ...existing, lastUpdateAt: now }); changed = true;
  }
  return changed;
};
export function updateStreamingState(state: State, now = Date.now()): void {
  countSyncPerformance('streamingFullReconciliations');
  const current = useStreamingStore.getState();
  const ids = new Map(current.streamingMessageIds); const states = new Map(current.messageStreamStates); let changed = false;
  const sessions = new Set(Object.keys(state.session_status));
  for (const sessionId of sessions) { countSyncPerformance('streamingSessionCandidatesVisited'); changed = updateOne(state, sessionId, now, ids, states) || changed; }
  for (const [sessionId, messageId] of current.streamingMessageIds) if (messageId && !sessions.has(sessionId)) changed = completeStreamingMessage(sessionId, messageId, now, ids, states) || changed;
  if (changed) useStreamingStore.setState({ streamingMessageIds: ids, messageStreamStates: states });
}
const collectChangedSessionIds = (current: Record<string, unknown> | undefined, previous: Record<string, unknown> | undefined, changed: Set<string>, countStatusEntries = false): void => {
  const next = current ?? {}; const prior = previous ?? {};
  for (const id of Object.keys(next)) { if (countStatusEntries) countSyncPerformance('streamingStatusEntriesVisited'); if (next[id] !== prior[id]) changed.add(id); }
  for (const id of Object.keys(prior)) { if (id in next) continue; if (countStatusEntries) countSyncPerformance('streamingStatusEntriesVisited'); changed.add(id); }
};
export function updateChangedStreamingSessions(state: State, previous: State, now = Date.now()): void {
  if (state.session_status === previous.session_status && state.message === previous.message && state.snapshot === previous.snapshot) return;
  countSyncPerformance('streamingIncrementalReconciliations');
  const changed = new Set<string>();
  if (state.session_status !== previous.session_status) collectChangedSessionIds(state.session_status, previous.session_status, changed, true);
  if (state.message !== previous.message) collectChangedSessionIds(state.message, previous.message, changed);
  if (state.snapshot !== previous.snapshot) collectChangedSessionIds(state.snapshot, previous.snapshot, changed);
  if (changed.size === 0) return;
  const current = useStreamingStore.getState(); const ids = new Map(current.streamingMessageIds); const states = new Map(current.messageStreamStates); let didChange = false;
  for (const sessionId of changed) { countSyncPerformance('streamingSessionCandidatesVisited'); didChange = updateOne(state, sessionId, now, ids, states) || didChange; }
  if (didChange) useStreamingStore.setState({ streamingMessageIds: ids, messageStreamStates: states });
}
