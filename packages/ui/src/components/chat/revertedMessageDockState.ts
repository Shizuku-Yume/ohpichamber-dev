import type { Message, Part } from '@openchamber/agent-contract';
import type { State } from '@/sync/types';

type RevertedMessageRecord = {
    message: Message;
    parts: Part[];
};

export type RevertedMessageDockState = {
    revertMessageID?: string;
    records: RevertedMessageRecord[];
};

export const EMPTY_REVERTED_MESSAGE_DOCK_STATE: RevertedMessageDockState = {
    revertMessageID: undefined,
    records: [],
};

/**
 * Staged transcript reverts are unsupported by the canonical session contract.
 * Do not infer a revert boundary from messages or manufacture reverted records.
 */
export const buildRevertedMessageDockState = (
    _state: Pick<State, 'session' | 'message'>,
    _sessionId: string | null,
    _previous: RevertedMessageDockState = EMPTY_REVERTED_MESSAGE_DOCK_STATE,
): RevertedMessageDockState => {
    void _previous;
    return EMPTY_REVERTED_MESSAGE_DOCK_STATE;
};
