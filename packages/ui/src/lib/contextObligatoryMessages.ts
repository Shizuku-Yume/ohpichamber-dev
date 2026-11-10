import type { Session, SessionMetadata } from '@openchamber/agent-contract';

export type ContextObligatoryMessage = {
  id: string;
  createdAt: number;
  role: 'user' | 'assistant';
  sessionID?: string;
};

// Pins are stored in pin order and read in conversation order.
export const getContextObligatoryMessages = (
  session: Session | null | undefined,
): ContextObligatoryMessage[] => {
<<<<<<< HEAD
  const messages = session?.metadata?.openchamber?.context_obligatory_messages ?? [];
  return [...messages].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
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
      // User forks are root sessions and keep inherited pins.
      if (!session.parentID) return true;
      if (typeof value.sessionID === 'string') return value.sessionID === session.id;
      const created = session.time?.created;
      return typeof created === 'number' && Number.isFinite(created) && value.createdAt > created;
    })
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
>>>>>>> bc50ba56a
};

export const withContextObligatoryMessage = (
  metadata: SessionMetadata,
  message: ContextObligatoryMessage,
  pinned: boolean,
<<<<<<< HEAD
): SessionMetadata => {
  const openchamber = metadata.openchamber ?? {};
  const current = openchamber.context_obligatory_messages ?? [];
  const withoutMessage = current.filter((value) => value.id !== message.id);
  const nextMessages = pinned ? [...withoutMessage, message] : withoutMessage;
  return { ...metadata, openchamber: { ...openchamber, context_obligatory_messages: nextMessages } };
=======
  sessionID = message.sessionID,
): SessionMetadataRecord => {
  if (pinned && !sessionID) throw new Error('sessionID is required to pin a message');
  const openchamber = isRecord(metadata.openchamber) ? metadata.openchamber : {};
  const current = Array.isArray(openchamber.context_obligatory_messages)
    ? openchamber.context_obligatory_messages.filter((value): value is ContextObligatoryMessage =>
      isRecord(value) && typeof value.id === 'string')
    : [];
  const withoutMessage = current.filter((value) => value.id !== message.id);
  const nextMessages = pinned ? [...withoutMessage, { ...message, sessionID }] : withoutMessage;

  return {
    ...metadata,
    openchamber: {
      ...openchamber,
      context_obligatory_messages: nextMessages,
    },
  };
>>>>>>> bc50ba56a
};
