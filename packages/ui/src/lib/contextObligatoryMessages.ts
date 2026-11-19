import type { Session, SessionMetadata } from '@openchamber/agent-contract';

export type ContextObligatoryMessage = {
  id: string;
  createdAt: number;
  role: 'user' | 'assistant';
};

<<<<<<< HEAD
// Pins are stored in pin order and read in conversation order.
||||||| bc50ba56aa
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

// Pins are stored in the order they were pinned; they read in conversation
// order, the way the compaction re-injection already sends them.
=======
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

>>>>>>> upstream/main
export const getContextObligatoryMessages = (
  session: Session | null | undefined,
): ContextObligatoryMessage[] => {
<<<<<<< HEAD
  const messages = session?.metadata?.openchamber?.context_obligatory_messages ?? [];
  return [...messages].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
||||||| bc50ba56aa
  const openchamber = getSessionMetadata(session).openchamber;
  if (!isRecord(openchamber) || !Array.isArray(openchamber.context_obligatory_messages)) return [];

  return openchamber.context_obligatory_messages
    .filter((value): value is ContextObligatoryMessage => {
      if (!isRecord(value)
        || typeof value.id !== 'string'
        || typeof value.createdAt !== 'number'
        || !Number.isFinite(value.createdAt)
        || (value.role !== 'user' && value.role !== 'assistant')) return false;
      if (!session?.id) return false;
      // User forks are root sessions and keep inherited pins.
      if (!session.parentID) return true;
      if (typeof value.sessionID === 'string') return value.sessionID === session.id;
      const created = session.time?.created;
      return typeof created === 'number' && Number.isFinite(created) && value.createdAt > created;
    })
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
=======
  const openchamber = getSessionMetadata(session).openchamber;
  if (!isRecord(openchamber) || !Array.isArray(openchamber.context_obligatory_messages)) return [];

  return openchamber.context_obligatory_messages
    .filter((value): value is ContextObligatoryMessage => {
      if (!isRecord(value)
        || typeof value.id !== 'string'
        || typeof value.createdAt !== 'number'
        || !Number.isFinite(value.createdAt)
        || (value.role !== 'user' && value.role !== 'assistant')) return false;
      if (!session?.id) return false;
      if (!session.parentID) return true;
      if (typeof value.sessionID === 'string') return value.sessionID === session.id;
      const created = session.time?.created;
      return typeof created === 'number' && Number.isFinite(created) && value.createdAt > created;
    })
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
>>>>>>> upstream/main
};

export const withContextObligatoryMessage = (
  metadata: SessionMetadata,
  message: ContextObligatoryMessage,
  pinned: boolean,
): SessionMetadata => {
  const openchamber = metadata.openchamber ?? {};
  const current = openchamber.context_obligatory_messages ?? [];
  const withoutMessage = current.filter((value) => value.id !== message.id);
  const nextMessages = pinned ? [...withoutMessage, message] : withoutMessage;
  return { ...metadata, openchamber: { ...openchamber, context_obligatory_messages: nextMessages } };
};
