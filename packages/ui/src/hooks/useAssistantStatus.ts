import React from 'react';
import { useChatSessionSelection } from '@/components/chat/chatColumnSession';
import type { Message, Part, ToolCallPart } from '@openchamber/agent-contract';

import { useSessionUIStore } from '@/sync/session-ui-store';
import { useDirectorySync, useSessionCompacting, useSessionForms, useSessionMessages, useSessionPermissions } from '@/sync/sync-context';
import { useSessionActivity } from './useSessionActivity';
import type { AgentStatus } from '@/lib/agentStatus';
import { normalizeIntent, toolPresentation } from '@/lib/toolPresentation';

interface WorkingSummary {
    isWorking: boolean;
    /** The status row's and the pill's localized phrase. */
    status: AgentStatus | null;
    isWaitingForPermission: boolean;
    abortActive: boolean;
    /** The retry the run is waiting on, from its newest `auto_retry_start` notice. */
    retryInfo: { attempt?: number; maxAttempts?: number; next?: number } | null;
}

interface FormingSummary {
    isActive: boolean;
    characterCount: number;
}

export interface AssistantStatusSnapshot {
    activeModel: ActiveAssistantModel | null;
    forming: FormingSummary;
    working: WorkingSummary;
}

interface ActiveAssistantModel {
    providerId: string;
    modelId: string;
}

interface ActiveAssistantContext {
    assistantId: string | null;
    model: ActiveAssistantModel | null;
}

interface ModelRef {
    providerId: string;
    modelId: string;
}

const DEFAULT_WORKING: WorkingSummary = {
    isWorking: false,
    status: null,
    isWaitingForPermission: false,
    abortActive: false,
    retryInfo: null,
};

const EMPTY_PARTS: Part[] = [];
const STATUS_SIGNATURE_SEPARATOR = '\u0000';

const isLiveToolStatus = (status: ToolCallPart['status']): boolean =>
    status === 'pending_approval' || status === 'approved' || status === 'running';

export type ParsedStatusResult = {
    status: AgentStatus;
    /** True when the run is writing its answer rather than naming a call. */
    isAnswering: boolean;
};

/**
 * What the run is doing, from the parts of its assistant message. OMP's own
 * precedence: a running call's intent names the work, an unsealed reasoning
 * part reads as thinking, and anything else is the plain working line.
 */
export const createParsedStatus = (parts: readonly Part[]): ParsedStatusResult => {
    let activeCall: ToolCallPart | undefined;
    let reasoning = false;
    let text = false;

    for (let index = parts.length - 1; index >= 0; index -= 1) {
        const part = parts[index];
        if (!part) continue;
        if (part.type === 'tool_call' && isLiveToolStatus(part.status)) {
            activeCall = part;
            break;
        }
        if (part.type === 'reasoning' && !reasoning) reasoning = part.content.trim().length > 0;
        if (part.type === 'text' && !text) text = part.content.trim().length > 0;
    }

    if (activeCall) {
        const presentation = toolPresentation(activeCall.toolName);
        const intent = normalizeIntent(typeof activeCall.input.i === 'string' ? activeCall.input.i : '');
        const described = intent ?? presentation.describeCall(activeCall.input);
        return {
            status: described
                ? { key: 'chat.agentStatus.usingTool', name: presentation.label, text: described }
                : { key: 'chat.agentStatus.usingTool', name: presentation.label },
            isAnswering: false,
        };
    }

    if (reasoning && !text) {
        return { status: { key: 'chat.agentStatus.thinking' }, isAnswering: false };
    }

    return { status: { key: 'chat.agentStatus.working' }, isAnswering: text };
};

/**
 * One field, so the value can be joined with the retry fields beside it without
 * its own payload splitting again. The status is JSON and the answering flag
 * rides inside it.
 */
export const encodeParsedStatus = (status: ParsedStatusResult): string => JSON.stringify({
    answering: status.isAnswering,
    key: status.status.key,
    count: status.status.count ?? null,
    name: status.status.name ?? null,
    text: status.status.text ?? null,
});

export const decodeParsedStatus = (signature: string): ParsedStatusResult => {
    let status: AgentStatus = { key: 'chat.agentStatus.working' };
    let isAnswering = false;
    if (signature) {
        try {
            const parsed = JSON.parse(signature) as {
                answering?: boolean;
                key: AgentStatus['key'];
                count: number | null;
                name: string | null;
                text: string | null;
            };
            status = { key: parsed.key };
            if (parsed.count !== null && parsed.count !== undefined) status.count = parsed.count;
            if (parsed.name !== null && parsed.name !== undefined) status.name = parsed.name;
            if (parsed.text !== null && parsed.text !== undefined) status.text = parsed.text;
            isAnswering = parsed.answering === true;
        } catch {
            // A signature from an older build carries no key; the working line stands in.
        }
    }
    return { status, isAnswering };
};

/**
 * The retry the run is waiting on, when the newest notice says so and nothing
 * has happened since: OMP reports `auto_retry_start` with the delay it will
 * wait, and the next text or call means the retry already ran.
 */
export const retryInfoOf = (parts: readonly Part[]): { attempt?: number; maxAttempts?: number; next?: number } | null => {
    for (let index = parts.length - 1; index >= 0; index -= 1) {
        const part = parts[index];
        if (!part) continue;
        if (part.type === 'notice' && part.noticeType === 'auto_retry_start') {
            return { attempt: part.details.attempt, maxAttempts: part.details.maxAttempts, next: part.details.delayMs };
        }
        if (part.type === 'tool_call' || (part.type === 'text' && part.content.trim().length > 0)) return null;
    }
    return null;
};

const hasNewerPrompt = (messages: Message[], index: number): boolean => {
    for (let cursor = messages.length - 1; cursor > index; cursor -= 1) {
        if (messages[cursor]?.role === 'user') return true;
    }
    return false;
};

/**
 * Canonical messages do not expose completion timestamps. A newer prompt may
 * follow either an active or finished assistant turn, so model attribution is
 * intentionally neutral until another assistant message arrives.
 */
export const getActiveAssistantContext = (messages: Message[], _sessionModel?: ModelRef | null): ActiveAssistantContext => {
    void _sessionModel;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message?.role !== 'assistant') continue;

        if (hasNewerPrompt(messages, index)) {
            return { assistantId: message.messageId, model: null };
        }

        const providerId = message.providerId?.trim() ?? '';
        const modelId = message.modelId?.trim() ?? '';
        return {
            assistantId: message.messageId,
            model: providerId && modelId ? { providerId, modelId } : null,
        };
    }

    return { assistantId: null, model: null };
};

export function useAssistantStatus(): AssistantStatusSnapshot {
    const { sessionId: currentSessionId, directory: currentSessionDirectory } = useChatSessionSelection();

    const rawSessionMessages = useSessionMessages(
        currentSessionId ?? '',
        currentSessionDirectory ?? undefined,
    );

    const activeAssistant = React.useMemo(
        () => getActiveAssistantContext(rawSessionMessages),
        [rawSessionMessages],
    );
    const lastAssistantId = activeAssistant.assistantId;

    const lastAssistantSignature = useDirectorySync(
        React.useCallback((state) => {
            const parts = lastAssistantId
                ? state.message[currentSessionId ?? '']?.find((message) => message.messageId === lastAssistantId)?.parts ?? EMPTY_PARTS
                : EMPTY_PARTS;
            const parsed = createParsedStatus(parts);
            const retry = retryInfoOf(parts);
            return [encodeParsedStatus(parsed), retry?.attempt ?? '', retry?.next ?? '', retry?.maxAttempts ?? ''].join(STATUS_SIGNATURE_SEPARATOR);
        }, [currentSessionId, lastAssistantId]),
        currentSessionDirectory ?? undefined,
    );

    const sessionPermissionRequests = useSessionPermissions(currentSessionId ?? '', currentSessionDirectory ?? undefined);
    const formHoldsTurn = useSessionForms(currentSessionId ?? '', currentSessionDirectory ?? undefined).length > 0;

    const sessionAbortRecord = useSessionUIStore(
        React.useCallback((state) => {
            if (!currentSessionId) {
                return null;
            }
            return state.sessionAbortFlags?.get(currentSessionId) ?? null;
        }, [currentSessionId])
    );

    const { isWorking: isPhaseWorking } = useSessionActivity(currentSessionId, currentSessionDirectory ?? undefined);
    const isCompacting = useSessionCompacting(currentSessionId, currentSessionDirectory ?? undefined) !== null;

    const parsedStatus = React.useMemo<ParsedStatusResult>(() => {
        const [signature] = lastAssistantSignature.split(STATUS_SIGNATURE_SEPARATOR);
        return decodeParsedStatus(signature ?? '');
    }, [lastAssistantSignature]);

    const retryInfo = React.useMemo(() => {
        const [, attempt, next, maxAttempts] = lastAssistantSignature.split(STATUS_SIGNATURE_SEPARATOR);
        // Only a real retry notice fills these; an empty field means no retry.
        if (!attempt || !Number.isFinite(Number(attempt))) return null;
        return {
            attempt: Number(attempt),
            ...(next && Number.isFinite(Number(next)) ? { next: Number(next) } : {}),
            ...(maxAttempts && Number.isFinite(Number(maxAttempts)) ? { maxAttempts: Number(maxAttempts) } : {}),
        };
    }, [lastAssistantSignature]);

    const abortState = React.useMemo(() => {
        const hasActiveAbort = Boolean(sessionAbortRecord && !sessionAbortRecord.acknowledged);
        return { wasAborted: hasActiveAbort, abortActive: hasActiveAbort };
    }, [sessionAbortRecord]);

    const baseWorking = React.useMemo<WorkingSummary>(() => {
        if (abortState.wasAborted) return { ...DEFAULT_WORKING, abortActive: abortState.abortActive };
        const isWorking = isPhaseWorking || isCompacting;
        return {
            isWorking,
            status: isCompacting
                ? { key: 'chat.agentStatus.compacting' }
                : isPhaseWorking ? parsedStatus.status : null,
            isWaitingForPermission: false,
            abortActive: false,
            retryInfo: isPhaseWorking && !isCompacting ? retryInfo : null,
        };
    }, [isPhaseWorking, isCompacting, parsedStatus, retryInfo, abortState]);

    const forming = React.useMemo<FormingSummary>(() => {
        const isActive = isPhaseWorking && !isCompacting && parsedStatus.isAnswering;
        return { isActive, characterCount: 0 };
    }, [isPhaseWorking, isCompacting, parsedStatus.isAnswering]);

    const working = React.useMemo<WorkingSummary>(() => {
        if (baseWorking.abortActive) return baseWorking;

        const hasPendingPermission = sessionPermissionRequests.length > 0;
        const hasPendingForm = formHoldsTurn;

        if (!hasPendingPermission && !hasPendingForm) {
            return baseWorking;
        }

        if (hasPendingForm) {
            return { ...baseWorking, isWorking: false, status: null, retryInfo: null };
        }

        return {
            ...baseWorking,
            status: { key: 'chat.agentStatus.waitingPermission' },
            isWaitingForPermission: true,
            retryInfo: null,
        };
    }, [baseWorking, sessionPermissionRequests, formHoldsTurn]);

    return {
        activeModel: activeAssistant.model,
        forming,
        working,
    };
}
