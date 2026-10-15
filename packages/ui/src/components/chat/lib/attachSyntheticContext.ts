import type { ChatMessageEntry } from './turns/types';

/**
 * Canonical messages already carry their ordered parts. The legacy synthetic
 * prompt records this helper used to fold into user messages have no canonical
 * representation, so context attachment is intentionally unsupported rather
 * than fabricating message or part records.
 */
export const attachSyntheticContext = (messages: ChatMessageEntry[]): ChatMessageEntry[] => messages;
