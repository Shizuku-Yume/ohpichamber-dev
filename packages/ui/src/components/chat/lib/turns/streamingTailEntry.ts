import type { Part } from '@openchamber/agent-contract';

import { getNormalizedMessageForDisplay } from '../messageDisplayNormalization';
import { projectTurnRecords } from './projectTurnRecords';
import type { ChatMessageEntry, TurnRecord } from './types';

export type StreamingTailEntry =
    | {
        kind: 'ungrouped';
        key: string;
        message: ChatMessageEntry;
        previousMessage?: ChatMessageEntry;
        nextMessage?: ChatMessageEntry;
    }
    | { kind: 'turn'; key: string; turn: TurnRecord; isLastTurn: boolean };

type BuildLiveStreamingEntryOptions = {
    livePartsByMessageId: Readonly<Record<string, Part[]>>;
    showTextJustificationActivity: boolean;
    showTurnChangedFiles: boolean;
    mergeHiddenUserTurns?: boolean;
};

const liveMessageByRecord = new WeakMap<ChatMessageEntry, { parts: Part[]; message: ChatMessageEntry }>();

<<<<<<< HEAD
/**
 * The record with the live parts of its own message. Results are parts of the
 * message that made the call, so the live store and the record agree on where
 * every part lives and no part is carried across messages.
 */
||||||| bc50ba56aa
// The store holds the step's own parts only; the notice rows
// `attachSyntheticContext` gave the record stay before or after the live ones,
// where each was placed.
const withNoticeRows = (recordParts: readonly Part[], liveParts: Part[]): Part[] => {
    if (!recordParts.some(isSessionNoticePart)) return liveParts;
    const before = recordParts.filter((part) => sessionNoticePlacement(part) === 'before');
    const after = recordParts.filter((part) => sessionNoticePlacement(part) === 'after');
    return [...before, ...liveParts, ...after];
};

=======
const withNoticeRows = (recordParts: readonly Part[], liveParts: Part[]): Part[] => {
    if (!recordParts.some(isSessionNoticePart)) return liveParts;
    const before = recordParts.filter((part) => sessionNoticePlacement(part) === 'before');
    const after = recordParts.filter((part) => sessionNoticePlacement(part) === 'after');
    return [...before, ...liveParts, ...after];
};

>>>>>>> upstream/main
const withLiveParts = (
    message: ChatMessageEntry,
    livePartsByMessageId: Readonly<Record<string, Part[]>>,
): ChatMessageEntry => {
<<<<<<< HEAD
    const liveParts = livePartsByMessageId[message.messageId];
    // An empty live array is ambiguous — the store may simply not have loaded
    // this message's parts — and must never erase parts the record does have.
||||||| bc50ba56aa
    const liveParts = livePartsByMessageId[message.info.id];
    // An empty live array is ambiguous — the store may simply not have loaded
    // this message's parts — and must never erase parts the record does have.
=======
    const liveParts = livePartsByMessageId[message.info.id];
>>>>>>> upstream/main
    if (!liveParts || liveParts.length === 0 || message.parts === liveParts) {
        return message;
    }

    const remembered = liveMessageByRecord.get(message);
    if (remembered?.parts === liveParts) return getNormalizedMessageForDisplay(remembered.message);
    const merged = { ...message, parts: liveParts };
    liveMessageByRecord.set(message, { parts: liveParts, message: merged });
    return getNormalizedMessageForDisplay(merged);
};

export const buildLiveStreamingEntry = <TEntry extends StreamingTailEntry>(
    entry: TEntry,
    options: BuildLiveStreamingEntryOptions,
): TEntry => {
    const livePartsByMessageId = options.livePartsByMessageId;

    if (entry.kind === 'ungrouped') {
        const message = withLiveParts(entry.message, livePartsByMessageId);
        if (message === entry.message) {
            return entry;
        }
        return {
            ...entry,
            message,
        };
    }

    let changed = false;
    const assistantMessages = entry.turn.assistantMessages.map((message) => {
        const next = withLiveParts(message, livePartsByMessageId);
        if (next !== message) {
            changed = true;
        }
        return next;
    });

    if (!changed) {
        return entry;
    }

<<<<<<< HEAD
    // Re-project from the turn's full ordered message records (not just
    // userMessage + assistants) so hidden user messages merged into this turn
    // keep parenting their assistant replies.
    const liveMessageById = new Map(assistantMessages.map((message) => [message.messageId, message]));
||||||| bc50ba56aa
    // Re-project from the turn's full ordered message records (not just
    // userMessage + assistants) so hidden user messages merged into this turn
    // keep parenting their assistant replies.
    const liveMessageById = new Map(assistantMessages.map((message) => [message.info.id, message]));
=======
    const liveMessageById = new Map(assistantMessages.map((message) => [message.info.id, message]));
>>>>>>> upstream/main
    const sourceMessages = entry.turn.messages.length > 0
        ? entry.turn.messages
            .slice()
            .sort((left, right) => left.order - right.order)
            .map((record) => liveMessageById.get(record.messageId) ?? record.message)
        : [entry.turn.userMessage, ...assistantMessages];

    const projection = projectTurnRecords(sourceMessages, {
        showTextJustificationActivity: options.showTextJustificationActivity,
        showTurnChangedFiles: options.showTurnChangedFiles,
        mergeHiddenUserTurns: options.mergeHiddenUserTurns,
    });
    const turn = projection.turns[0] ?? {
        ...entry.turn,
        assistantMessages,
        assistantMessageIds: assistantMessages.map((message) => message.messageId),
    };

    return {
        ...entry,
        turn,
    };
};
