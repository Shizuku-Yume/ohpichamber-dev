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
    mergeHiddenUserTurns?: boolean;
<<<<<<< HEAD
||||||| bc50ba56aa
    /**
     * The messages are one turn's own records, so the first one opens the
     * turn whatever its role: a notice that split a turn has no answer ahead
     * of it once the turn is re-projected alone.
     */
    firstMessageOpensTurn?: boolean;
=======
    firstMessageOpensTurn?: boolean;
>>>>>>> upstream/main
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

<<<<<<< HEAD
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
||||||| bc50ba56aa
    let changedFiles: { value: TurnRecord['changedFiles'] } | undefined;
    const readChangedFiles = (): TurnRecord['changedFiles'] => {
        if (changedFiles) return changedFiles.value;
        // Changed files and their line counts are only shown under a finished
        // answer, so tool patches are not parsed while the turn still streams.
        const finalMessage = assistantMessages[assistantMessages.length - 1];
        const hasFinalAnswer = finalMessage?.info.role === 'assistant' && finalMessage.info.finish === 'stop';
        changedFiles = { value: showTurnChangedFiles && hasFinalAnswer ? projectTurnChangedFiles(assistantMessages) : undefined };
        return changedFiles.value;
=======
    let changedFiles: { value: TurnRecord['changedFiles'] } | undefined;
    const readChangedFiles = (): TurnRecord['changedFiles'] => {
        if (changedFiles) return changedFiles.value;
        const finalMessage = assistantMessages[assistantMessages.length - 1];
        const hasFinalAnswer = finalMessage?.info.role === 'assistant' && finalMessage.info.finish === 'stop';
        changedFiles = { value: showTurnChangedFiles && hasFinalAnswer ? projectTurnChangedFiles(assistantMessages) : undefined };
        return changedFiles.value;
>>>>>>> upstream/main
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

    let stream: TurnStreamState | undefined;
    const readStream = (): TurnStreamState => {
        stream ??= buildTurnStreamState(turn.userMessage, assistantMessages);
        return stream;
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
        // Stream state also inspects tool-call parts, so it joins the same
        // read-on-first-render boundary as summary/activity/changed files.
        stream: lazy(readStream),
        startedAt: lazy(() => readStream().startedAt),
        completedAt: lazy(() => readStream().completedAt),
        durationMs: lazy(() => readStream().durationMs),
    });

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

<<<<<<< HEAD
    // Ordered messages retain their canonical turn identity. Hidden user
    // prompts can still be merged into the preceding visible turn.
||||||| bc50ba56aa
    // v2 assistant messages carry no parent id: a reply belongs to the last
    // user message before it, so one ordered pass does the grouping. An
    // assistant message with no user message ahead of it stays ungrouped. A
    // background subagent run opens a turn too: the parent reacts to its result.
    // So does a notice between two answers (see `createNoticeTurnSplitter`).
    let currentTurn: TurnRecord | undefined;
    const splitAtNotice = createNoticeTurnSplitter();

    const openTurn = (message: ChatMessageEntry, index: number): TurnRecord => {
        const turn: TurnRecord = {
            turnId: message.info.id,
            userMessageId: message.info.id,
            userMessage: message,
            headerMessageId: undefined,
            messages: [createTurnMessageRecord(message, index)],
            assistantMessageIds: [],
            assistantMessages: [],
            activityParts: [],
            summary: {},
            summaryText: undefined,
            hasTools: false,
            hasReasoning: false,
            changedFiles: undefined,
            stream: {
                isStreaming: false,
                isRetrying: false,
            },
        };
        turns.push(turn);
        groupedMessageIds.add(message.info.id);
        return turn;
    };
=======
    let currentTurn: TurnRecord | undefined;
    const splitAtNotice = createNoticeTurnSplitter();

    const openTurn = (message: ChatMessageEntry, index: number): TurnRecord => {
        const turn: TurnRecord = {
            turnId: message.info.id,
            userMessageId: message.info.id,
            userMessage: message,
            headerMessageId: undefined,
            messages: [createTurnMessageRecord(message, index)],
            assistantMessageIds: [],
            assistantMessages: [],
            activityParts: [],
            summary: {},
            summaryText: undefined,
            hasTools: false,
            hasReasoning: false,
            changedFiles: undefined,
            stream: {
                isStreaming: false,
                isRetrying: false,
            },
        };
        turns.push(turn);
        groupedMessageIds.add(message.info.id);
        return turn;
    };
>>>>>>> upstream/main

    messages.forEach((message, index) => {
        const role = resolveMessageRole(message);
        if (role === 'assistant') {
            let currentTurn = turnByCanonicalId.get(message.turnId);
            if (!currentTurn && turns.length > 0) {
                // A run OMP starts itself (a plan or goal continuation) opens a
                // turn without a user prompt of its own. Its steps continue the
                // conversation the user is already reading, so they join that
                // turn; they are never hidden for lacking a prompt row.
                currentTurn = turns[turns.length - 1];
                turnByCanonicalId.set(message.turnId, currentTurn);
            }
            // A session whose transcript opens on an answer has no turn to
            // join; the row stands alone rather than disappearing.
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
<<<<<<< HEAD
        if (role !== 'user') {
||||||| bc50ba56aa
        // A notice before the run's first step stays in the prompt's turn.
        if (currentTurn && currentTurn.assistantMessages.length === 0 && readSessionNotice(message.info)) {
            currentTurn.waitingNotices = [...(currentTurn.waitingNotices ?? []), message];
            currentTurn.messages.push(createTurnMessageRecord(message, index));
            groupedMessageIds.add(message.info.id);
            return;
        }
        if (role !== 'user' && !isTurnOpeningNotice(message.info)) {
=======
        if (currentTurn && currentTurn.assistantMessages.length === 0 && readSessionNotice(message.info)) {
            currentTurn.waitingNotices = [...(currentTurn.waitingNotices ?? []), message];
            currentTurn.messages.push(createTurnMessageRecord(message, index));
            groupedMessageIds.add(message.info.id);
            return;
        }
        if (role !== 'user' && !isTurnOpeningNotice(message.info)) {
>>>>>>> upstream/main
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
        // A message that joined no turn still has content the reader asked to
        // see: render it as its own row, notice rows included.
        if (!groupedMessageIds.has(message.messageId)) {
            ungroupedMessageIds.add(message.messageId);
        }
    });

    return {
        ...projection,
        ungroupedMessageIds,
    };
};
