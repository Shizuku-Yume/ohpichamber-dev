import { isHiddenUserMessage } from '../../message/hiddenUserMessage';
import { getLiveFinalMessage } from './liveActivity';
import { projectTurnActivity } from './projectTurnActivity';
import { projectTurnIndexes } from './projectTurnIndexes';
import { projectTurnChangedFiles, projectTurnDiffStats, projectTurnSummary } from './projectTurnSummary';
import type {
    ChatMessageEntry,
    TurnMessageRecord,
    TurnProjectionResult,
    TurnRecord,
    TurnStreamState,
} from './types';

const resolveMessageRole = (message: ChatMessageEntry): string => message.role;

const getMessageCreatedAt = (message: ChatMessageEntry): number => message.createdAt;

const createTurnMessageRecord = (message: ChatMessageEntry, order: number): TurnMessageRecord => {
    const role = resolveMessageRole(message);
    return {
        messageId: message.messageId,
        role,
        message,
        order,
    };
};

const buildTurnStreamState = (userMessage: ChatMessageEntry, assistantMessages: ChatMessageEntry[]): TurnStreamState => {
    const startedAt = getMessageCreatedAt(userMessage);
    let isStreaming = false;

    assistantMessages.forEach((message) => {
        // Message DTOs do not contain completion timestamps. Pending calls are
        // observable activity; turn lifecycle belongs to the runtime status.
        isStreaming ||= message.parts.some((part) => part.type === 'tool_call'
            && (part.status === 'running' || part.status === 'approved' || part.status === 'pending_approval'));
    });


    return {
        isStreaming,
        isRetrying: assistantMessages.some((message) => Boolean(message.retryError)),
        startedAt,
    };
};

interface ProjectTurnRecordsOptions {
    previousProjection?: TurnProjectionResult | null;
    showTextJustificationActivity: boolean;
    showTurnChangedFiles: boolean;
    /**
     * When true, a turn whose user message is hidden (no visible display parts,
     * e.g. a prompt OpenChamber sent on the user's behalf) is merged into the
     * previous turn instead of starting a new one.
     */
    mergeHiddenUserTurns?: boolean;
}

const DEFAULT_OPTIONS: ProjectTurnRecordsOptions = {
    previousProjection: null,
    showTextJustificationActivity: false,
    showTurnChangedFiles: false,
    mergeHiddenUserTurns: false,
};

const areSameMessageRefs = (left: ChatMessageEntry[], right: ChatMessageEntry[]): boolean => {
    if (left === right) {
        return true;
    }
    if (left.length !== right.length) {
        return false;
    }

    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) {
            return false;
        }
    }

    return true;
};

const canReusePreviousTurn = (previous: TurnRecord, next: TurnRecord): boolean => {
    return previous.userMessage === next.userMessage
        && previous.headerMessageId === next.headerMessageId
        && areSameMessageRefs(previous.assistantMessages, next.assistantMessages);
};

type TurnChanges = Pick<TurnRecord, 'diffStats' | 'changedFiles'>;
type TurnActivity = ReturnType<typeof projectTurnActivity>;

// Summary, activity and changed files are read only by rendered turn rows,
// and the transcript list mounts a handful of rows out of a long history. So
// each is derived on first read and kept: opening a session pays for the rows
// on screen, not for every turn it holds. The inputs are fixed here, since a
// turn record never changes after hydration; changed messages produce a new
// record instead.
const hydrateTurnRecord = (
    turn: TurnRecord,
    effectiveOptions: ProjectTurnRecordsOptions,
): TurnRecord => {
    const { assistantMessages, turnId } = turn;
    const { showTextJustificationActivity, showTurnChangedFiles } = effectiveOptions;

    let summary: TurnRecord['summary'] | undefined;
    const readSummary = () => {
        summary ??= projectTurnSummary(assistantMessages);
        return summary;
    };

    let changes: TurnChanges | undefined;
    const readChanges = (): TurnChanges => {
        if (changes) return changes;
        // Changed files and their line counts are only shown under a finished
        // answer, so tool patches are not parsed while the turn still streams.
        const hasFinalAnswer = Boolean(getLiveFinalMessage(assistantMessages));
        const changedFiles = hasFinalAnswer ? projectTurnChangedFiles(assistantMessages) : undefined;
        changes = {
            diffStats: projectTurnDiffStats(changedFiles),
            changedFiles: showTurnChangedFiles ? changedFiles : undefined,
        };
        return changes;
    };

    let activity: TurnActivity | undefined;
    const readActivity = (): TurnActivity => {
        if (activity) return activity;
        const { sourceMessageId, sourcePartId } = readSummary();
        activity = projectTurnActivity({
            turnId,
            assistantMessages,
            summarySourceMessageId: sourceMessageId,
            summarySourcePartId: sourcePartId,
            showTextJustificationActivity,
        });
        return activity;
    };

    const lazy = <T>(read: () => T): PropertyDescriptor => ({ get: read, enumerable: true, configurable: true });
    Object.defineProperties(turn, {
        summary: lazy(readSummary),
        summaryText: lazy(() => readSummary().text),
        diffStats: lazy(() => readChanges().diffStats),
        changedFiles: lazy(() => readChanges().changedFiles),
        activityParts: lazy(() => readActivity().activityParts),
        activitySegments: lazy(() => readActivity().activitySegments),
        hasTools: lazy(() => readActivity().hasTools),
        hasReasoning: lazy(() => readActivity().hasReasoning),
    });

    turn.stream = buildTurnStreamState(turn.userMessage, assistantMessages);
    turn.startedAt = turn.stream.startedAt;
    turn.completedAt = turn.stream.completedAt;
    turn.durationMs = turn.stream.durationMs;
    return turn;
};

const hydrateStableTurnRecords = (
    turns: TurnRecord[],
    effectiveOptions: ProjectTurnRecordsOptions,
): TurnRecord[] => {
    const previousProjection = effectiveOptions.previousProjection;
    if (!previousProjection || previousProjection.turns.length === 0 || turns.length === 0) {
        return turns.map((turn) => hydrateTurnRecord(turn, effectiveOptions));
    }

    let canReuseTurnArray = previousProjection.turns.length === turns.length;
    let reusedAnyTurn = false;

    const nextTurns = turns.map((turn, index) => {
        const previousTurn = previousProjection.indexes.turnById.get(turn.turnId);
        if (previousTurn && canReusePreviousTurn(previousTurn, turn)) {
            reusedAnyTurn = true;
            if (previousProjection.turns[index] !== previousTurn) {
                canReuseTurnArray = false;
            }
            return previousTurn;
        }

        canReuseTurnArray = false;
        return hydrateTurnRecord(turn, effectiveOptions);
    });

    if (canReuseTurnArray && reusedAnyTurn) {
        return previousProjection.turns;
    }

    return nextTurns;
};

export const projectTurnRecords = (
    messages: ChatMessageEntry[],
    options?: Partial<ProjectTurnRecordsOptions>,
): TurnProjectionResult => {
    const effectiveOptions: ProjectTurnRecordsOptions = {
        ...DEFAULT_OPTIONS,
        ...options,
    };

    const turns: TurnRecord[] = [];
    const turnByCanonicalId = new Map<string, TurnRecord>();
    const groupedMessageIds = new Set<string>();

    const mergeHiddenUserTurns = effectiveOptions.mergeHiddenUserTurns;

    // Ordered messages retain their canonical turn identity. Hidden user
    // prompts can still be merged into the preceding visible turn.

    messages.forEach((message, index) => {
        const role = resolveMessageRole(message);
        if (role === 'assistant') {
            const currentTurn = turnByCanonicalId.get(message.turnId);
            if (!currentTurn) return;
            currentTurn.assistantMessages.push(message);
            currentTurn.assistantMessageIds.push(message.messageId);
            currentTurn.messages.push(createTurnMessageRecord(message, index));
            if (!currentTurn.headerMessageId) {
                currentTurn.headerMessageId = message.messageId;
            }
            groupedMessageIds.add(message.messageId);
            return;
        }
        if (role !== 'user') {
            return;
        }

        const previousTurn = turns[turns.length - 1];
        if (
            mergeHiddenUserTurns
            && previousTurn
            && isHiddenUserMessage(message)
        ) {
            turnByCanonicalId.set(message.turnId, previousTurn);
            previousTurn.messages.push(createTurnMessageRecord(message, index));
            groupedMessageIds.add(message.messageId);
            return;
        }

        const turnId = message.turnId;
        const turn: TurnRecord = {
            turnId,
            userMessageId: message.messageId,
            userMessage: message,
            headerMessageId: undefined,
            messages: [createTurnMessageRecord(message, index)],
            assistantMessageIds: [],
            assistantMessages: [],
            activityParts: [],
            activitySegments: [],
            summary: {},
            summaryText: undefined,
            hasTools: false,
            hasReasoning: false,
            diffStats: undefined,
            changedFiles: undefined,
            stream: {
                isStreaming: false,
                isRetrying: false,
            },
        };
        turns.push(turn);
        turnByCanonicalId.set(message.turnId, turn);
        groupedMessageIds.add(message.messageId);
    });

    const stableTurns = hydrateStableTurnRecords(turns, effectiveOptions);
    const projection = projectTurnIndexes(stableTurns);
    const ungroupedMessageIds = new Set<string>();
    messages.forEach((message) => {
        // An assistant reply without a canonical user turn has nothing to
        // anchor it; render it neither as a turn nor as a standalone row. A
        // page loaded from the middle of a session starts on such a reply.
        if (message.role !== 'assistant' && !groupedMessageIds.has(message.messageId)) {
            ungroupedMessageIds.add(message.messageId);
        }
    });

    return {
        ...projection,
        ungroupedMessageIds,
    };
};
