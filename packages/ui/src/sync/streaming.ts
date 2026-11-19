<<<<<<< HEAD
/** Native canonical streaming lifecycle tracking. */
import { create } from 'zustand';
import type { Message, SessionRuntimeStatus } from '@openchamber/agent-contract';
import type { State } from './types';
import { countSyncPerformance } from './performance-diagnostics';
||||||| bc50ba56aa
/**
 * Streaming lifecycle tracking.
 *
 * Derives streaming state from the sync child store's session_status and
 * message/part updates. Components read this to know which messages are
 * currently streaming and their lifecycle phase.
 */

import { create } from "zustand"
import type { Message, SessionStatus } from "@/lib/opencode/model"
import type { State } from "./types"
import { countSyncPerformance } from "./performance-diagnostics"

type StreamPhase = "streaming" | "cooldown" | "completed"

type MessageStreamState = {
  phase: StreamPhase
  startedAt: number
  lastUpdateAt: number
  completedAt?: number
}

type StreamingStore = {
  /** Currently streaming message per session */
  streamingMessageIds: Map<string, string | null>
  /** Lifecycle phase per message */
  messageStreamStates: Map<string, MessageStreamState>
}

export const useStreamingStore = create<StreamingStore>()(() => ({
  streamingMessageIds: new Map(),
  messageStreamStates: new Map(),
}))

export function resetStreamingState() {
  useStreamingStore.setState({
    streamingMessageIds: new Map(),
    messageStreamStates: new Map(),
  })
}

/**
 * Called from the SyncBridge/flush handler when child store state changes.
 * Derives streaming state from session_status + messages.
 */
/** Only update lastUpdateAt every this many ms to avoid 60Hz store churn */
const STREAMING_HEARTBEAT_MS = 1000
=======

import { create } from "zustand"
import type { Message, SessionStatus } from "@/lib/opencode/model"
import type { State } from "./types"
import { countSyncPerformance } from "./performance-diagnostics"

type StreamPhase = "streaming" | "cooldown" | "completed"

type MessageStreamState = {
  phase: StreamPhase
  startedAt: number
  lastUpdateAt: number
  completedAt?: number
}

type StreamingStore = {
  streamingMessageIds: Map<string, string | null>
  messageStreamStates: Map<string, MessageStreamState>
}

export const useStreamingStore = create<StreamingStore>()(() => ({
  streamingMessageIds: new Map(),
  messageStreamStates: new Map(),
}))

export function resetStreamingState() {
  useStreamingStore.setState({
    streamingMessageIds: new Map(),
    messageStreamStates: new Map(),
  })
}

const STREAMING_HEARTBEAT_MS = 1000
>>>>>>> upstream/main

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
<<<<<<< HEAD
const collectChangedSessionIds = (current: Record<string, unknown> | undefined, previous: Record<string, unknown> | undefined, changed: Set<string>, countStatusEntries = false): void => {
  const next = current ?? {}; const prior = previous ?? {};
  for (const id of Object.keys(next)) { if (countStatusEntries) countSyncPerformance('streamingStatusEntriesVisited'); if (next[id] !== prior[id]) changed.add(id); }
  for (const id of Object.keys(prior)) { if (id in next) continue; if (countStatusEntries) countSyncPerformance('streamingStatusEntriesVisited'); changed.add(id); }
};
||||||| bc50ba56aa

/**
 * The server stamps `time.completed` on an assistant message only after its
 * whole response (text + every tool call) finished. A completed trailing
 * message therefore means the message itself is done even when the turn keeps
 * running (next step, follow-up tool phase) — it must not stay marked as
 * streaming, or the typing indicator and the part-update suspension linger on
 * finished content until the session settles.
 */
const isTrailingMessageComplete = (message: Message): boolean => {
  return message.role === "assistant" && message.time.completed !== undefined
}

export function updateStreamingState(state: State, now = Date.now()) {
  countSyncPerformance("streamingFullReconciliations")
  const currentStore = useStreamingStore.getState()
  const currentStreamingIds = currentStore.streamingMessageIds
  const currentStreamStates = currentStore.messageStreamStates

  const nextStreamingIds = new Map<string, string | null>()
  const nextStreamStates = new Map(currentStreamStates)
  let changed = false

  // Fast path: only scan sessions that are actually busy.
  // Idle sessions are handled by checking against currentStreamingIds below.
  const busySessionIds = new Set<string>()
  for (const [sessionID, status] of Object.entries(state.session_status ?? {})) {
    countSyncPerformance("streamingStatusEntriesVisited")
    if ((status as SessionStatus).type === "busy") {
      busySessionIds.add(sessionID)
    }
  }

  const completeStreamingMessage = (sessionID: string, msgId: string) => {
    nextStreamingIds.set(sessionID, null)
    const existing = nextStreamStates.get(msgId)
    if (existing && existing.phase === "streaming") {
      nextStreamStates.set(msgId, {
        ...existing,
        phase: "completed",
        completedAt: now,
      })
    }
    changed = true
  }

  for (const sessionID of busySessionIds) {
    countSyncPerformance("streamingSessionCandidatesVisited")
    const messages = state.message[sessionID]
    if (!messages || messages.length === 0) continue

    // Only the trailing assistant turn can be streaming. If a new user turn is
    // last, the next assistant message has not arrived yet.
    const streamingMsg = findTrailingAssistantMessage(messages)

    if (!streamingMsg) {
      const prevId = currentStreamingIds.get(sessionID)
      if (prevId) {
        completeStreamingMessage(sessionID, prevId)
      }
      continue
    }

    // The trailing assistant message already finished (time.completed), so
    // nothing is streaming right now even though the session stays busy for
    // the rest of the turn. Complete any previously streaming message instead
    // of re-marking the finished one as streaming.
    if (isTrailingMessageComplete(streamingMsg)) {
      const prevId = currentStreamingIds.get(sessionID)
      if (prevId) {
        completeStreamingMessage(sessionID, prevId)
      }
      continue
    }

    const prevId = currentStreamingIds.get(sessionID)
    if (prevId !== streamingMsg.id) changed = true
    nextStreamingIds.set(sessionID, streamingMsg.id)

    const existing = nextStreamStates.get(streamingMsg.id)
    if (!existing || existing.phase !== "streaming") {
      nextStreamStates.set(streamingMsg.id, {
        phase: "streaming",
        startedAt: existing?.startedAt ?? now,
        lastUpdateAt: now,
      })
      changed = true
    } else if (now - existing.lastUpdateAt >= STREAMING_HEARTBEAT_MS) {
      // Throttle lastUpdateAt writes to ~1Hz instead of 60Hz
      nextStreamStates.set(streamingMsg.id, {
        ...existing,
        lastUpdateAt: now,
      })
      changed = true
    }
  }

  // Mark completed any previously streaming sessions that are now idle or gone
  for (const [sessionID, msgId] of currentStreamingIds) {
    if (!msgId) continue
    const isStillBusy = busySessionIds.has(sessionID)
    if (isStillBusy) continue

    completeStreamingMessage(sessionID, msgId)
  }

  if (changed) {
    useStreamingStore.setState({
      streamingMessageIds: nextStreamingIds,
      messageStreamStates: nextStreamStates,
    })
  }
}

const collectChangedSessionIds = (
  current: Record<string, unknown> | undefined,
  previous: Record<string, unknown> | undefined,
  changed: Set<string>,
  countStatusEntries = false,
) => {
  const currentRecord = current ?? {}
  const previousRecord = previous ?? {}
  for (const sessionID of Object.keys(currentRecord)) {
    if (countStatusEntries) countSyncPerformance("streamingStatusEntriesVisited")
    if (currentRecord[sessionID] !== previousRecord[sessionID]) changed.add(sessionID)
  }
  for (const sessionID of Object.keys(previousRecord)) {
    if (Object.prototype.hasOwnProperty.call(currentRecord, sessionID)) continue
    if (countStatusEntries) countSyncPerformance("streamingStatusEntriesVisited")
    changed.add(sessionID)
  }
}

=======

const isTrailingMessageComplete = (message: Message): boolean => {
  return message.role === "assistant" && message.time.completed !== undefined
}

export function updateStreamingState(state: State, now = Date.now()) {
  countSyncPerformance("streamingFullReconciliations")
  const currentStore = useStreamingStore.getState()
  const currentStreamingIds = currentStore.streamingMessageIds
  const currentStreamStates = currentStore.messageStreamStates

  const nextStreamingIds = new Map<string, string | null>()
  const nextStreamStates = new Map(currentStreamStates)
  let changed = false

  const busySessionIds = new Set<string>()
  for (const [sessionID, status] of Object.entries(state.session_status ?? {})) {
    countSyncPerformance("streamingStatusEntriesVisited")
    if ((status as SessionStatus).type === "busy") {
      busySessionIds.add(sessionID)
    }
  }

  const completeStreamingMessage = (sessionID: string, msgId: string) => {
    nextStreamingIds.set(sessionID, null)
    const existing = nextStreamStates.get(msgId)
    if (existing && existing.phase === "streaming") {
      nextStreamStates.set(msgId, {
        ...existing,
        phase: "completed",
        completedAt: now,
      })
    }
    changed = true
  }

  for (const sessionID of busySessionIds) {
    countSyncPerformance("streamingSessionCandidatesVisited")
    const messages = state.message[sessionID]
    if (!messages || messages.length === 0) continue

    const streamingMsg = findTrailingAssistantMessage(messages)

    if (!streamingMsg) {
      const prevId = currentStreamingIds.get(sessionID)
      if (prevId) {
        completeStreamingMessage(sessionID, prevId)
      }
      continue
    }

    if (isTrailingMessageComplete(streamingMsg)) {
      const prevId = currentStreamingIds.get(sessionID)
      if (prevId) {
        completeStreamingMessage(sessionID, prevId)
      }
      continue
    }

    const prevId = currentStreamingIds.get(sessionID)
    if (prevId !== streamingMsg.id) changed = true
    nextStreamingIds.set(sessionID, streamingMsg.id)

    const existing = nextStreamStates.get(streamingMsg.id)
    if (!existing || existing.phase !== "streaming") {
      nextStreamStates.set(streamingMsg.id, {
        phase: "streaming",
        startedAt: existing?.startedAt ?? now,
        lastUpdateAt: now,
      })
      changed = true
    } else if (now - existing.lastUpdateAt >= STREAMING_HEARTBEAT_MS) {
      nextStreamStates.set(streamingMsg.id, {
        ...existing,
        lastUpdateAt: now,
      })
      changed = true
    }
  }

  for (const [sessionID, msgId] of currentStreamingIds) {
    if (!msgId) continue
    const isStillBusy = busySessionIds.has(sessionID)
    if (isStillBusy) continue

    completeStreamingMessage(sessionID, msgId)
  }

  if (changed) {
    useStreamingStore.setState({
      streamingMessageIds: nextStreamingIds,
      messageStreamStates: nextStreamStates,
    })
  }
}

const collectChangedSessionIds = (
  current: Record<string, unknown> | undefined,
  previous: Record<string, unknown> | undefined,
  changed: Set<string>,
  countStatusEntries = false,
) => {
  const currentRecord = current ?? {}
  const previousRecord = previous ?? {}
  for (const sessionID of Object.keys(currentRecord)) {
    if (countStatusEntries) countSyncPerformance("streamingStatusEntriesVisited")
    if (currentRecord[sessionID] !== previousRecord[sessionID]) changed.add(sessionID)
  }
  for (const sessionID of Object.keys(previousRecord)) {
    if (Object.prototype.hasOwnProperty.call(currentRecord, sessionID)) continue
    if (countStatusEntries) countSyncPerformance("streamingStatusEntriesVisited")
    changed.add(sessionID)
  }
}

>>>>>>> upstream/main
export function updateChangedStreamingSessions(state: State, previous: State, now = Date.now()): void {
<<<<<<< HEAD
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
||||||| bc50ba56aa
  const statusChanged = state.session_status !== previous.session_status
  const messagesChanged = state.message !== previous.message
  if (!statusChanged && !messagesChanged) return

  countSyncPerformance("streamingIncrementalReconciliations")
  const changedSessionIds = new Set<string>()
  if (statusChanged) {
    collectChangedSessionIds(
      state.session_status as Record<string, unknown> | undefined,
      previous.session_status as Record<string, unknown> | undefined,
      changedSessionIds,
      true,
    )
  }
  if (messagesChanged) {
    collectChangedSessionIds(
      state.message as Record<string, unknown> | undefined,
      previous.message as Record<string, unknown> | undefined,
      changedSessionIds,
    )
  }
  if (changedSessionIds.size === 0) return

  const currentStore = useStreamingStore.getState()
  const nextStreamingIds = new Map(currentStore.streamingMessageIds)
  const nextStreamStates = new Map(currentStore.messageStreamStates)
  let changed = false

  const complete = (sessionID: string, messageID: string) => {
    if (nextStreamingIds.get(sessionID) !== null) {
      nextStreamingIds.set(sessionID, null)
      changed = true
    }
    const existing = nextStreamStates.get(messageID)
    if (existing?.phase === "streaming") {
      nextStreamStates.set(messageID, { ...existing, phase: "completed", completedAt: now })
      changed = true
    }
  }

  for (const sessionID of changedSessionIds) {
    countSyncPerformance("streamingSessionCandidatesVisited")
    const previousMessageID = currentStore.streamingMessageIds.get(sessionID)
    if (state.session_status?.[sessionID]?.type !== "busy") {
      if (previousMessageID) complete(sessionID, previousMessageID)
      continue
    }

    const streamingMessage = findTrailingAssistantMessage(state.message[sessionID])

    if (!streamingMessage) {
      if (previousMessageID) complete(sessionID, previousMessageID)
      continue
    }

    // Completed trailing message while the turn keeps running: nothing is
    // streaming — clear the marker and any previous streaming message instead
    // of keeping the finished message flagged as streaming.
    if (isTrailingMessageComplete(streamingMessage)) {
      if (previousMessageID) complete(sessionID, previousMessageID)
      continue
    }

    if (previousMessageID && previousMessageID !== streamingMessage.id) {
      complete(sessionID, previousMessageID)
    }
    if (nextStreamingIds.get(sessionID) !== streamingMessage.id) {
      nextStreamingIds.set(sessionID, streamingMessage.id)
      changed = true
    }

    const existing = nextStreamStates.get(streamingMessage.id)
    if (!existing || existing.phase !== "streaming") {
      nextStreamStates.set(streamingMessage.id, {
        phase: "streaming",
        startedAt: existing?.startedAt ?? now,
        lastUpdateAt: now,
      })
      changed = true
    }
  }

  if (changed) {
    useStreamingStore.setState({
      streamingMessageIds: nextStreamingIds,
      messageStreamStates: nextStreamStates,
    })
  }
}

export function touchStreamingSession(sessionID: string, now = Date.now()): void {
  countSyncPerformance("streamingHeartbeatAttempts")
  const current = useStreamingStore.getState()
  const messageID = current.streamingMessageIds.get(sessionID)
  if (!messageID) return
  const existing = current.messageStreamStates.get(messageID)
  if (!existing || existing.phase !== "streaming" || now - existing.lastUpdateAt < STREAMING_HEARTBEAT_MS) return

  const messageStreamStates = new Map(current.messageStreamStates)
  messageStreamStates.set(messageID, { ...existing, lastUpdateAt: now })
  countSyncPerformance("streamingHeartbeatCommits")
  useStreamingStore.setState({ messageStreamStates })
=======
  const statusChanged = state.session_status !== previous.session_status
  const messagesChanged = state.message !== previous.message
  if (!statusChanged && !messagesChanged) return

  countSyncPerformance("streamingIncrementalReconciliations")
  const changedSessionIds = new Set<string>()
  if (statusChanged) {
    collectChangedSessionIds(
      state.session_status as Record<string, unknown> | undefined,
      previous.session_status as Record<string, unknown> | undefined,
      changedSessionIds,
      true,
    )
  }
  if (messagesChanged) {
    collectChangedSessionIds(
      state.message as Record<string, unknown> | undefined,
      previous.message as Record<string, unknown> | undefined,
      changedSessionIds,
    )
  }
  if (changedSessionIds.size === 0) return

  const currentStore = useStreamingStore.getState()
  const nextStreamingIds = new Map(currentStore.streamingMessageIds)
  const nextStreamStates = new Map(currentStore.messageStreamStates)
  let changed = false

  const complete = (sessionID: string, messageID: string) => {
    if (nextStreamingIds.get(sessionID) !== null) {
      nextStreamingIds.set(sessionID, null)
      changed = true
    }
    const existing = nextStreamStates.get(messageID)
    if (existing?.phase === "streaming") {
      nextStreamStates.set(messageID, { ...existing, phase: "completed", completedAt: now })
      changed = true
    }
  }

  for (const sessionID of changedSessionIds) {
    countSyncPerformance("streamingSessionCandidatesVisited")
    const previousMessageID = currentStore.streamingMessageIds.get(sessionID)
    if (state.session_status?.[sessionID]?.type !== "busy") {
      if (previousMessageID) complete(sessionID, previousMessageID)
      continue
    }

    const streamingMessage = findTrailingAssistantMessage(state.message[sessionID])

    if (!streamingMessage) {
      if (previousMessageID) complete(sessionID, previousMessageID)
      continue
    }

    if (isTrailingMessageComplete(streamingMessage)) {
      if (previousMessageID) complete(sessionID, previousMessageID)
      continue
    }

    if (previousMessageID && previousMessageID !== streamingMessage.id) {
      complete(sessionID, previousMessageID)
    }
    if (nextStreamingIds.get(sessionID) !== streamingMessage.id) {
      nextStreamingIds.set(sessionID, streamingMessage.id)
      changed = true
    }

    const existing = nextStreamStates.get(streamingMessage.id)
    if (!existing || existing.phase !== "streaming") {
      nextStreamStates.set(streamingMessage.id, {
        phase: "streaming",
        startedAt: existing?.startedAt ?? now,
        lastUpdateAt: now,
      })
      changed = true
    }
  }

  if (changed) {
    useStreamingStore.setState({
      streamingMessageIds: nextStreamingIds,
      messageStreamStates: nextStreamStates,
    })
  }
}

export function touchStreamingSession(sessionID: string, now = Date.now()): void {
  countSyncPerformance("streamingHeartbeatAttempts")
  const current = useStreamingStore.getState()
  const messageID = current.streamingMessageIds.get(sessionID)
  if (!messageID) return
  const existing = current.messageStreamStates.get(messageID)
  if (!existing || existing.phase !== "streaming" || now - existing.lastUpdateAt < STREAMING_HEARTBEAT_MS) return

  const messageStreamStates = new Map(current.messageStreamStates)
  messageStreamStates.set(messageID, { ...existing, lastUpdateAt: now })
  countSyncPerformance("streamingHeartbeatCommits")
  useStreamingStore.setState({ messageStreamStates })
>>>>>>> upstream/main
}
