import type { Message, Part } from '@openchamber/agent-contract';

/** Canonical message plus a display-only session retry notice. */
export type ChatMessageEntry = Message & {
    retryError?: { name: 'SessionRetry'; message: string; data: { message: string } };
};

type TurnActivityKind = 'tool' | 'reasoning' | 'justification';

export interface TurnMessageRecord {
    messageId: string;
    role: string;
    message: ChatMessageEntry;
    order: number;
}

export interface TurnPartRecord {
    id: string;
    turnId: string;
    messageId: string;
    part: Part;
    partIndex: number;
    endedAt?: number;
}

export interface TurnActivityRecord extends TurnPartRecord {
    kind: TurnActivityKind;
}

export interface TurnDiffStats {
    additions: number;
    deletions: number;
    files: number;
}

export interface TurnChangedFile {
    file: string;
<<<<<<< HEAD
    /** Absent when the tool result does not report line counts. */
||||||| bc50ba56aa
    /** Absent when neither the turn diff nor the tool call reports line counts. */
=======
>>>>>>> upstream/main
    additions?: number;
    deletions?: number;
<<<<<<< HEAD
}

export interface TurnActivityGroup {
    id: string;
    anchorMessageId: string;
    afterToolPartId: string | null;
    parts: TurnActivityRecord[];
||||||| bc50ba56aa
    /** False when the turn diff view has no entry for this path, so a pill cannot open it. */
    inTurnDiff?: boolean;
=======
    inTurnDiff?: boolean;
>>>>>>> upstream/main
}

export interface TurnSummaryRecord {
    text?: string;
    sourceMessageId?: string;
    sourcePartId?: string;
}

export interface TurnStreamState {
    isStreaming: boolean;
    isRetrying: boolean;
    startedAt?: number;
    completedAt?: number;
    durationMs?: number;
}

export interface TurnRecord {
    turnId: string;
    userMessageId: string;
    userMessage: ChatMessageEntry;
    headerMessageId?: string;
    messages: TurnMessageRecord[];
    assistantMessageIds: string[];
    assistantMessages: ChatMessageEntry[];
<<<<<<< HEAD
||||||| bc50ba56aa
    /**
     * Session notices that came after the prompt before the run's first step
     * existed. They render in the turn until that step arrives and takes them
     * as rows (`attachSyntheticContext`).
     */
    waitingNotices?: ChatMessageEntry[];
=======
    waitingNotices?: ChatMessageEntry[];
>>>>>>> upstream/main
    activityParts: TurnActivityRecord[];
    activitySegments: TurnActivityGroup[];
    summary: TurnSummaryRecord;
    summaryText?: string;
    hasTools: boolean;
    hasReasoning: boolean;
    diffStats?: TurnDiffStats;
    changedFiles?: TurnChangedFile[];
    stream: TurnStreamState;
    startedAt?: number;
    completedAt?: number;
    durationMs?: number;
}

interface TurnMessageMeta {
    turnId: string;
    messageId: string;
    userMessageId: string;
    isUserMessage: boolean;
    isAssistantMessage: boolean;
    isFirstAssistantInTurn: boolean;
    isLastAssistantInTurn: boolean;
    headerMessageId?: string;
}

export interface TurnIndexes {
    turnById: Map<string, TurnRecord>;
    messageToTurnId: Map<string, string>;
    messageMetaById: Map<string, TurnMessageMeta>;
}

export interface TurnProjectionResult {
    turns: TurnRecord[];
    indexes: TurnIndexes;
    lastTurnId: string | null;
    lastTurnMessageIds: Set<string>;
    ungroupedMessageIds: Set<string>;
}

export type Turn = Pick<TurnRecord, 'turnId' | 'userMessage' | 'assistantMessages'>;

export interface TurnGroupingContext {
    turnId: string;
    activityOwnerMessageId?: string;
    isFirstAssistantInTurn: boolean;
    isLastAssistantInTurn: boolean;
<<<<<<< HEAD
    hasEarlierAssistantText?: boolean;
||||||| bc50ba56aa
    /**
     * Text the turn's earlier assistant messages wrote, one entry per text
     * part, in order. Set on the last assistant message only, so the turn
     * footer can copy and save the whole reply.
     */
    earlierAssistantText?: string[];
=======
    opensAnswerText?: boolean;
    earlierAssistantText?: string[];
>>>>>>> upstream/main
    isLatestTurn: boolean;
    summaryBody?: string;
    activityParts?: TurnActivityRecord[];
    activityGroupSegments?: TurnActivityGroup[];
    headerMessageId?: string;
    hasTools: boolean;
    hasReasoning: boolean;
    diffStats?: TurnDiffStats;
    changedFiles?: TurnChangedFile[];
    userMessageCreatedAt?: number;
    assistantVariant?: string;
    isWorking: boolean;
    isGroupExpanded?: boolean;
    toggleGroup?: () => void;
}
