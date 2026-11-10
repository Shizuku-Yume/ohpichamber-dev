import type { Message, Turn } from '@openchamber/agent-contract';

export interface LatestReply {
 messageId: string;
 text: string;
}

export const extractMessageText = (message: Message): string => message.parts
 .filter((part) => part.type === 'text')
 .map((part) => part.content)
 .join('')
 .trim();

const completedReplyText = (record: LatestReplyRecord): string | null => {
    const { info, parts } = record;
    if (info.role !== 'assistant') return null;
    if (info.finish !== 'stop') return null;
    if (info.time.completed === undefined || info.time.completed <= 0) return null;

    const text = flattenAssistantTextParts(parts).trim();
    return text || null;
};

/**
 * The answer of the session's newest prompt, when that turn has authoritatively
 * finished and its final assistant message carries text.
 *
 * The newest prompt is the authority: while it is running, failed, cancelled,
 * or its final message is missing or has no text, there is no reply to read.
 * An earlier completed answer never stands in for it, so auto-read can only
 * ever speak the answer to the prompt the user actually sent last.
 */
<<<<<<< HEAD
export const findLatestCompletedReply = (
 turns: readonly Turn[],
 messages: readonly Message[],
): LatestReply | null => {
 const turn = turns.at(-1);
 if (!turn || turn.status !== 'completed') return null;
 const messageId = turn.assistantMessageIds.at(-1);
 if (!messageId) return null;
 const message = messages.find((candidate) => candidate.messageId === messageId);
 if (!message || message.role !== 'assistant') return null;
 const text = extractMessageText(message);
 return text ? { messageId, text } : null;
};

/**
 * Every message id of the turn, so a caller can tell a reply it has already
 * handled from one that just arrived without walking the transcript.
 */
export const turnMessageIds = (turn: Turn): readonly string[] => [
 turn.userMessageId,
 ...turn.assistantMessageIds,
];
=======
export const findLatestCompletedReply = (messages: readonly LatestReplyRecord[]): LatestReply | null => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const record = messages[index];
        if (!record) continue;
        if (record.info.role === 'user') return null;

        const text = completedReplyText(record);
        if (text) return { messageId: record.info.id, text };
    }

    return null;
};

/** Finished answers across all turns, for the auto-read history baseline. */
export const findCompletedReplyIds = (messages: readonly LatestReplyRecord[]): string[] => {
    const ids: string[] = [];
    for (const record of messages) {
        if (completedReplyText(record)) ids.push(record.info.id);
    }
    return ids;
};
>>>>>>> bc50ba56a
