import type { Message, Part } from '@openchamber/agent-contract';
import type { State } from '@/sync/types';

type RevertedMessageRecord = {
<<<<<<< HEAD
    message: Message;
||||||| bc50ba56aa
    /**
     * A prompt, a background subagent run report (it stands where a prompt
     * would), or a synthetic message that may carry a prompt's attached context
     * (a quote, a terminal selection), which the strip folds back onto it.
     */
    message: UserMessage | SyntheticMessage;
=======
    message: UserMessage | SyntheticMessage;
>>>>>>> upstream/main
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
