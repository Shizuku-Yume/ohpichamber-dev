/**
 * Canonical transcripts do not encode synthetic subagent completion reports,
 * cancellation notes, or tool-to-child-session metadata. Readers explicitly
 * report those relationships as unavailable. Live child activity is projected
 * separately by components/chat/lib/runningSubagentRuns.
 */
import type { Message } from '@openchamber/agent-contract';

/** UI result shape retained for consumers that can display a known run. */
export type SubagentRunState = 'running' | 'completed' | 'error' | 'cancelled';

export type SubagentRun = {
    childSessionID: string;
    agent?: string;
    state: SubagentRunState;
    description?: string;
    output: string;
    reportedAt: number;
};

/** Canonical messages have no synthetic completion-report representation. */
export function readSubagentRun(_message: Message): SubagentRun | undefined {
    return undefined;
}

/** Canonical message IDs never identify fabricated running-subagent messages. */
export const isRunningSubagentRunMessage = (_messageID: string): boolean => false;

/** No canonical tool part identifies the child session of a background call. */
export function readBackgroundSubagentChildID(_part: unknown): string | undefined {
    return undefined;
}

/** Completion reports cannot be recovered from canonical transcript content. */
export function findSubagentRun(_messages: readonly Message[], _childSessionID: string): SubagentRun | undefined {
    return undefined;
}

/**
 * Model-facing payload for the retained OpenCode cancellation transport.
 * This is not a canonical Message and is never inserted into transcript state.
 */
export function subagentCancellationNote(input: { childSessionID: string; description: string | undefined }) {
    const named = input.description ? `the subagent "${input.description}"` : 'a subagent';
    return {
        text: [
            `The user stopped ${named} (sessionID: ${input.childSessionID}).`,
            'The result for it that follows reports that the subagent was cancelled.',
            'That is how the stop shows up: the subagent did not fail on its own, the user cancelled it.',
            'Do not start it again just because of that result. The same work is fine to delegate later when the task or the user needs it.',
        ].join(' '),
        description: 'Subagent stopped by the user',
        metadata: { openchamberSubagentCancellation: { sessionID: input.childSessionID } },
    };
}

/** Canonical messages do not record the source of a child-session cancellation. */
export function findSubagentCancellation(_messages: readonly Message[], _childSessionID: string): boolean {
    return false;
}
