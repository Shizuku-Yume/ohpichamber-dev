import type { Message, Session } from '@openchamber/agent-contract';
import type { State } from '@/sync/types';

/** A UI-only timeline row, never a fabricated canonical Message or turn. */
type RunningSubagentRun = {
    type: 'running_subagent';
    sessionId: string;
    parentSessionId: string;
    createdAt: number;
    description: string | undefined;
};

const EMPTY_RUNS: RunningSubagentRun[] = [];

const isBusy = (state: Pick<State, 'session_status' | 'sessionStatusInvalidated'>, sessionId: string): boolean => {
    if (state.sessionStatusInvalidated?.[sessionId]) return false;
    const status = state.session_status[sessionId];
    return status === 'running' || status === 'awaiting_approval' || status === 'awaiting_input';
};

/**
 * Canonical child activity is authoritative. Canonical messages have no
 * synthetic subagent reports or tool metadata linking calls to child sessions,
 * so this projection does not guess those legacy transcript relationships.
 */
export const selectRunningSubagentRuns = (
    state: Pick<State, 'session' | 'session_status' | 'sessionStatusInvalidated'>,
    parentSessionId: string,
): RunningSubagentRun[] => {
    const runs: RunningSubagentRun[] = [];
    for (const session of state.session) {
        if (session.parentSessionId !== parentSessionId || !isBusy(state, session.sessionId)) continue;
        runs.push(projectRunningSession(session, parentSessionId));
    }
    return runs.length === 0 ? EMPTY_RUNS : runs;
};

const projectRunningSession = (session: Session, parentSessionId: string): RunningSubagentRun => ({
    type: 'running_subagent',
    sessionId: session.sessionId,
    parentSessionId,
    createdAt: session.createdAt,
    description: session.title,
});

/** Keep transient child activity separate from canonical transcript records. */
export const withRunningSubagentRuns = (
    messages: Message[],
    runs: readonly RunningSubagentRun[],
): Array<Message | RunningSubagentRun> => {
    if (runs.length === 0) return messages;
    const result: Array<Message | RunningSubagentRun> = [...messages];
    for (const run of runs) {
        const index = result.findIndex((entry) => entry.createdAt > run.createdAt);
        result.splice(index < 0 ? result.length : index, 0, run);
    }
    return result;
};
