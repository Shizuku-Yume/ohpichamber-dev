import type { JsonValue, ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';

/**
 * The view of a tool call that the chat's page, secret and image cards draw.
 *
 * Upstream's cards describe a call as one record carrying everything the
 * engine stored: `tool`, a `callID`, a `state` with `input`, `output`,
 * `metadata` and `time`, and the message and session it belonged to. The
 * canonical contract splits that in two: a `tool_call` part holds the name and
 * arguments, and a separate `tool_result` part holds the outcome. This module
 * is the single place that joins them back into one record for presentation;
 * it knows no engine shapes, only the canonical parts.
 */
export type CanonicalToolView = {
    /** The canonical parts this view joins, for a component that draws the row itself. */
    call: ToolCallPart;
    result: ToolResultPart | undefined;
    tool: string;
    callID: string;
    id: string;
    sessionID: string;
    messageID: string;
    state: CanonicalToolState;
};

export type CanonicalToolState =
    | { status: 'pending'; input: Record<string, JsonValue>; raw: string }
    | { status: 'running'; input: Record<string, JsonValue>; metadata: Record<string, JsonValue>; time: { start: number } }
    | {
        status: 'completed';
        input: Record<string, JsonValue>;
        output: string;
        metadata: Record<string, JsonValue>;
        time: { start: number; end: number };
    }
    | {
        status: 'error';
        input: Record<string, JsonValue>;
        error: string;
        output?: string;
        metadata: Record<string, JsonValue>;
        time: { start: number; end: number };
    };

/** Concatenated text of a canonical tool result, however the agent encoded it. */
export const toolResultText = (result: ToolResultPart | undefined): string => {
    if (!result) return '';
    const output = result.output;
    if (typeof output === 'string') return output;
    if (output === undefined || output === null) return result.error ?? '';
    try {
        return JSON.stringify(output, null, 2);
    } catch {
        return String(output);
    }
};

/**
 * The metadata a canonical result carries: the result's own structured output
 * when it is an object, so a card reading `metadata.openchamber` sees the
 * envelope the agent tool returned.
 */
const resultMetadata = (result: ToolResultPart | undefined): Record<string, JsonValue> => {
    const output = result?.output;
    if (output !== null && typeof output === 'object' && !Array.isArray(output)) {
        return output as Record<string, JsonValue>;
    }
    return {};
};

const statusToState = (status: ToolCallPart['status']): CanonicalToolState['status'] => {
    switch (status) {
        case 'pending_approval':
        case 'approved':
            return 'pending';
        case 'running':
            return 'running';
        case 'completed':
            return 'completed';
        case 'failed':
        case 'denied':
        case 'cancelled':
            return 'error';
    }
};

/**
 * The presentation view of one canonical call and its (optionally glued)
 * result. `result` is the result part paired with this call by
 * `attachToolResultsForDisplay`, so a call shown while it runs gets its live
 * output as soon as the agent reports it.
 */
export const toToolView = (
    call: ToolCallPart,
    result: ToolResultPart | undefined,
    ids: { sessionID: string; messageID: string },
): CanonicalToolView => {
    const status = statusToState(call.status);
    const input = call.input as Record<string, JsonValue>;
    const metadata = resultMetadata(result);
    const output = result ? toolResultText(result) : undefined;
    const createdAt = result ? undefined : call.approvalId;
    // The canonical contract does not timestamp a call; a card only needs a
    // start for ordering, and a settled result supplies its own.
    const start = 0;
    const timed = { start, end: start + (result ? 1 : 0) };

    let state: CanonicalToolState;
    switch (status) {
        case 'pending':
            state = { status: 'pending', input, raw: '' };
            break;
        case 'running':
            state = { status: 'running', input, metadata, time: { start } };
            break;
        case 'completed':
            state = { status: 'completed', input, output: output ?? '', metadata, time: timed };
            break;
        case 'error':
            state = {
                status: 'error',
                input,
                error: result?.error ?? '',
                ...(result && result.isError === false && output ? { output } : {}),
                metadata,
                time: timed,
            };
            break;
    }

    void createdAt;
    return {
        call,
        result,
        tool: call.toolName,
        callID: call.toolCallId,
        id: call.partId,
        sessionID: ids.sessionID,
        messageID: ids.messageID,
        state,
    };
};

/** A page's ask state, as the cards and the status line read it. */
export type RenderedPageAsk =
    | { kind: 'show' }
    | { kind: 'waiting' }
    | { kind: 'answered'; summary: string; data: JsonValue }
    | { kind: 'answered-in-chat' }
    | { kind: 'chat-sent-earlier' }
    | { kind: 'not-drawn' }
    | { kind: 'declined' }
    | { kind: 'unanswered' };

export type RenderedPage = { html: string; ui?: string; title: string; ask: RenderedPageAsk };

export type RequestedSecret = { label: string; reason: string; placeholder: string | undefined };

export type RequestedSecretRun = {
    reason: string;
    command: string;
    program: string;
    fields: { env: string; label: string; placeholder: string | undefined }[];
};
