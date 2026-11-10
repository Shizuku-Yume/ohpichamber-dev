import type { Session, SessionMetadata } from '@openchamber/agent-contract';

export type ContextObligatoryMessage = {
  id: string;
  createdAt: number;
  role: 'user' | 'assistant';
};

// Pins are stored in pin order and read in conversation order.
export const getContextObligatoryMessages = (
  session: Session | null | undefined,
): ContextObligatoryMessage[] => {
  const messages = session?.metadata?.openchamber?.context_obligatory_messages ?? [];
  return [...messages].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
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
