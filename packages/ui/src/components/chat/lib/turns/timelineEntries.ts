import type { ChatMessageEntry, TurnRecord } from './types';

export type TimelineEntry =
    | {
        kind: 'ungrouped';
        key: string;
        message: ChatMessageEntry;
        previousMessage?: ChatMessageEntry;
        nextMessage?: ChatMessageEntry;
<<<<<<< HEAD
||||||| bc50ba56aa
        /** The first row the transcript draws; it gets the session's top spacing. */
        isFirstRow?: boolean;
=======
        isFirstRow?: boolean;
>>>>>>> upstream/main
    }
    | {
        kind: 'turn';
        key: string;
        turn: TurnRecord;
        isLastTurn: boolean;
        hasLaterAssistant?: boolean;
        nextEntryFirstMessage?: ChatMessageEntry;
    };

type HistoryEntriesInput = {
    staticTurns: readonly TurnRecord[];
    lastTurnId: string | null;
    turnsWithLaterAssistant: ReadonlySet<string>;
    messages: readonly ChatMessageEntry[];
    ungroupedMessageIds: ReadonlySet<string>;
    hasStreamingTurn: boolean;
    trailingEntryFirstMessage: ChatMessageEntry | undefined;
};

<<<<<<< HEAD
||||||| bc50ba56aa
/**
 * The first message the transcript draws. Skipped roles render nothing, except
 * session notices, which render despite their role.
 */
export const findFirstVisibleMessageId = (messages: readonly ChatMessageEntry[]): string | undefined => (
    messages.find((message) => !isSkippedTimelineMessage(message.info) || readSessionNotice(message.info))?.info.id
);

=======
export const findFirstVisibleMessageId = (messages: readonly ChatMessageEntry[]): string | undefined => (
    messages.find((message) => !isSkippedTimelineMessage(message.info) || readSessionNotice(message.info))?.info.id
);

>>>>>>> upstream/main
const entryFirstMessage = (entry: TimelineEntry): ChatMessageEntry => (
    entry.kind === 'turn' ? entry.turn.userMessage : entry.message
);

const orderHistoryEntries = ({
    staticTurns,
    lastTurnId,
    turnsWithLaterAssistant,
    messages,
    ungroupedMessageIds,
    hasStreamingTurn,
}: HistoryEntriesInput): TimelineEntry[] => {
    const turnEntries: TimelineEntry[] = staticTurns.map((turn) => ({
        kind: 'turn',
        key: `turn:${turn.turnId}`,
        turn,
        isLastTurn: turn.turnId === lastTurnId,
        hasLaterAssistant: turnsWithLaterAssistant.has(turn.turnId),
    }));
    if (ungroupedMessageIds.size === 0) return turnEntries;

    const turnEntryByUserMessageId = new Map<string, TimelineEntry>();
    for (const entry of turnEntries) {
        turnEntryByUserMessageId.set(entryFirstMessage(entry).messageId, entry);
    }

    const ordered: TimelineEntry[] = [];
    messages.forEach((message, index) => {
        const turnEntry = turnEntryByUserMessageId.get(message.messageId);
        if (turnEntry) {
            ordered.push(turnEntry);
            return;
        }
<<<<<<< HEAD
        if (!ungroupedMessageIds.has(message.messageId)) return;
        // Without a live turn the trailing entry renders the last message.
||||||| bc50ba56aa
        if (!ungroupedMessageIds.has(message.info.id)) return;
        // Without a live turn the trailing entry renders the last message.
=======
        if (!ungroupedMessageIds.has(message.info.id)) return;
>>>>>>> upstream/main
        if (!hasStreamingTurn && index === messages.length - 1) return;
        ordered.push({
            kind: 'ungrouped',
            key: `msg:${message.messageId}`,
            message,
            previousMessage: index > 0 ? messages[index - 1] : undefined,
            nextMessage: index < messages.length - 1 ? messages[index + 1] : undefined,
        });
    });
    return ordered;
};

const isSameEntry = (previous: TimelineEntry, next: TimelineEntry): boolean => {
    if (previous.kind === 'turn' && next.kind === 'turn') {
        return previous.turn === next.turn
            && previous.isLastTurn === next.isLastTurn
            && previous.hasLaterAssistant === next.hasLaterAssistant
            && previous.nextEntryFirstMessage === next.nextEntryFirstMessage;
    }
    if (previous.kind === 'ungrouped' && next.kind === 'ungrouped') {
        return previous.message === next.message
            && previous.previousMessage === next.previousMessage
            && previous.nextMessage === next.nextMessage;
    }
    return false;
};

export const buildHistoryEntries = (
    input: HistoryEntriesInput,
    previous: TimelineEntry[],
): TimelineEntry[] => {
    const ordered = orderHistoryEntries(input);
    const previousByKey = new Map<string, TimelineEntry>();
    for (const entry of previous) previousByKey.set(entry.key, entry);

    let unchanged = ordered.length === previous.length;
    const entries = ordered.map((entry, index) => {
        let next = entry;
        if (entry.kind === 'turn') {
            const following = ordered[index + 1];
            const nextEntryFirstMessage = following ? entryFirstMessage(following) : input.trailingEntryFirstMessage;
            if (nextEntryFirstMessage) next = { ...entry, nextEntryFirstMessage };
        }
        const reusable = previousByKey.get(next.key);
        if (reusable && isSameEntry(reusable, next)) next = reusable;
        if (next !== previous[index]) unchanged = false;
        return next;
    });
    return unchanged ? previous : entries;
};
