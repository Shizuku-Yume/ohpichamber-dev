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
    // Live parts for EVERY message of the streaming tail, not only the one
    // currently streaming: when the stream moves to the next step message, the
    // previous message's base record can still lag behind the part store, and
    // rendering it from that stale snapshot briefly drops its completed tool
    // parts — remounting them (and replaying their reveal animation) once the
    // record catches up.
    livePartsByMessageId: Readonly<Record<string, Part[]>>;
    showTextJustificationActivity: boolean;
    showTurnChangedFiles: boolean;
    mergeHiddenUserTurns?: boolean;
};

// The record with its live parts, kept per record so an unchanged pair is the
// same object on the next publish. The display normalizer memoizes by object
// identity; a fresh spread every 100 ms publish normalized every assistant
// message of the turn again, not only the one that streamed.
const liveMessageByRecord = new WeakMap<ChatMessageEntry, { parts: Part[]; message: ChatMessageEntry }>();

/**
 * Display-only tool results live on their call's message, but the live part
 * store still carries them on the separate system message. Overlaying raw
 * live parts would therefore drop every result from the tail turn. Keep the
 * results already paired into the record, at their recorded position, and let
 * live parts own everything else.
 */
const mergeLiveParts = (recordParts: readonly Part[], liveParts: readonly Part[]): Part[] => {
    const liveById = new Map(liveParts.map((part) => [part.partId, part]));
    const merged: Part[] = [];
    for (const part of recordParts) {
        const live = liveById.get(part.partId);
        if (live) {
            merged.push(live);
            liveById.delete(part.partId);
            continue;
        }
        if (part.type === 'tool_result') merged.push(part);
    }
    for (const part of liveParts) {
        if (liveById.has(part.partId)) merged.push(part);
    }
    return merged;
};

const withLiveParts = (
    message: ChatMessageEntry,
    livePartsByMessageId: Readonly<Record<string, Part[]>>,
): ChatMessageEntry => {
    const liveParts = livePartsByMessageId[message.messageId];
    // An empty live array is ambiguous — the store may simply not have loaded
    // this message's parts — and must never erase parts the record does have.
    if (!liveParts || liveParts.length === 0 || message.parts === liveParts) {
        return message;
    }

    const remembered = liveMessageByRecord.get(message);
    if (remembered?.parts === liveParts) return getNormalizedMessageForDisplay(remembered.message);
    const parts = message.parts.some((part) => part.type === 'tool_result')
        ? mergeLiveParts(message.parts, liveParts)
        : liveParts;
    const merged = { ...message, parts };
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

    // Re-project from the turn's full ordered message records (not just
    // userMessage + assistants) so hidden user messages merged into this turn
    // keep parenting their assistant replies.
    const liveMessageById = new Map(assistantMessages.map((message) => [message.messageId, message]));
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
