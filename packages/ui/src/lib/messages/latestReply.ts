import type { Message, Turn } from '@openchamber/agent-contract';

export interface LatestReply {
 messageId: string;
 text: string;
}

<<<<<<< HEAD
const extractMessageText = (message: Message): string => message.parts
 .filter((part) => part.type === 'text')
 .map((part) => part.content)
 .join('')
 .trim();
||||||| bc50ba56aa
/** One entry of the session history the search reads, newest last. */
export interface LatestReplyRecord {
    info: Message;
    parts: Part[];
}
=======
export interface LatestReplyRecord {
    info: Message;
    parts: Part[];
}
>>>>>>> upstream/main

/**
 * The answer of the session's newest prompt, when that turn has authoritatively
 * finished and its final assistant message carries text.
 *
 * The newest prompt is the authority: while it is running, failed, cancelled,
 * or its final message is missing or has no text, there is no reply to read.
 * An earlier completed answer never stands in for it, so auto-read can only
 * ever speak the answer to the prompt the user actually sent last.
 */
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

<<<<<<< HEAD
/**
 * Every message id of the turn, so a caller can tell a reply it has already
 * handled from one that just arrived without walking the transcript.
 */
export const turnMessageIds = (turn: Turn): readonly string[] => [
 turn.userMessageId,
 ...turn.assistantMessageIds,
];
||||||| bc50ba56aa
/**
 * The last answer of the latest prompt: the newest completed assistant
 * message that finished with `stop` and has text to read. Steps that ended in
 * tool calls, aborted turns, and messages still streaming are left out.
 */
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

export const findCompletedReplyIds = (messages: readonly LatestReplyRecord[]): string[] => {
    const ids: string[] = [];
    for (const record of messages) {
        if (completedReplyText(record)) ids.push(record.info.id);
    }
    return ids;
};
>>>>>>> upstream/main
