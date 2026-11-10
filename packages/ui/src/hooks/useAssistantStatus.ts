import React from 'react';
import { useChatSessionSelection } from '@/components/chat/chatColumnSession';
import type { Message, Part, ToolCallPart } from '@openchamber/agent-contract';

import type { MessageStreamPhase } from '@/stores/types/sessionTypes';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useDirectorySync, useSessionMessages, useSessionPermissions, useSessionForms } from '@/sync/sync-context';
import { useSessionActivity } from './useSessionActivity';
import type { AgentStatus } from '@/lib/agentStatus';

type AssistantActivity = 'idle' | 'streaming' | 'tooling' | 'cooldown' | 'permission';

interface WorkingSummary {
    activity: AssistantActivity;
    hasWorkingContext: boolean;
    hasActiveTools: boolean;
    isWorking: boolean;
    isStreaming: boolean;
    isCooldown: boolean;
    lifecyclePhase: MessageStreamPhase | null;
    statusText: string | null;
    /** The same activity as a dictionary key, so the pill and status row localize it. */
    status: AgentStatus | null;
    isGenericStatus: boolean;
    isWaitingForPermission: boolean;
    canAbort: boolean;
    compactionDeadline: number | null;
    activePartType?: 'text' | 'tool' | 'reasoning' | 'editing';
    activeToolName?: string;
    wasAborted: boolean;
    abortActive: boolean;
    lastCompletionId: string | null;
    isComplete: boolean;
    retryInfo: { attempt?: number; next?: number } | null;
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
    activity: 'idle',
    hasWorkingContext: false,
    hasActiveTools: false,
    isWorking: false,
    isStreaming: false,
    isCooldown: false,
    lifecyclePhase: null,
    statusText: null,
    status: null,
    isGenericStatus: true,
    isWaitingForPermission: false,
    canAbort: false,
    compactionDeadline: null,
    activePartType: undefined,
    activeToolName: undefined,
    wasAborted: false,
    abortActive: false,
    lastCompletionId: null,
    isComplete: false,
    retryInfo: null,
};

const EMPTY_PARTS: Part[] = [];
const STATUS_SIGNATURE_SEPARATOR = '\u0000';

type ToolBucket = 'read' | 'search' | 'edit' | 'command' | 'lookup' | 'delegate' | 'question' | 'skill' | 'plan' | 'evaluate';

// OMP builtin tools use their native identities; other names stay visible.
const TOOL_BUCKETS: Record<string, ToolBucket> = {
    read: 'read', grep: 'search', glob: 'search', find: 'search', ast_grep: 'search',
    edit: 'edit', write: 'edit', ast_edit: 'edit',
    bash: 'command', eval: 'evaluate',
    lsp: 'lookup', web_search: 'lookup', fetch: 'lookup', github: 'lookup',
    task: 'delegate', ask: 'question', manage_skill: 'skill', todo: 'plan',
};

// [one call, several calls]; `{count}` becomes the number of parallel calls in
// the bucket. A search spans many files in one call, so it is not counted.
const BUCKET_PHRASES = {
    read: ['reading a file', 'reading {count} files'],
    search: ['searching files', 'searching files'],
    edit: ['editing a file', 'editing {count} files'],
    command: ['running a command', 'running {count} commands'],
    evaluate: ['running code', 'running {count} code samples'],
    lookup: ['looking things up', 'looking things up'],
    delegate: ['handing off a task', 'handing off {count} tasks'],
    question: ['asking a question', 'asking a question'],
    skill: ['picking up a skill', 'picking up {count} skills'],
    plan: ['updating the plan', 'updating the plan'],
} satisfies Record<ToolBucket, readonly [string, string]>;
const WORKING_PHRASES = [
    'working',
    'processing',
    'preparing',
    'warming up',
    'gears turning',
    'computing',
    'calculating',
    'analyzing',
    'wheels spinning',
    'calibrating',
    'synthesizing',
    'connecting dots',
    'inspecting logic',
    'weighing options',
];

type ParsedStatusResult = {
    activePartType: 'text' | 'tool' | 'reasoning' | 'editing' | undefined;
    activeToolName: string | undefined;
    statusText: string;
    status: AgentStatus;
    isGenericStatus: boolean;
};

// The dictionary keys behind each bucket's phrase; a tool the catalogue has no
// phrase for reads as its name.
const BUCKET_STATUS = {
    read: 'chat.agentStatus.read',
    search: 'chat.agentStatus.search',
    edit: 'chat.agentStatus.edit',
    command: 'chat.agentStatus.command',
    lookup: 'chat.agentStatus.lookup',
    delegate: 'chat.agentStatus.delegate',
    question: 'chat.agentStatus.question',
    skill: 'chat.agentStatus.skill',
} as const;
const COUNTED_STATUS = {
    read: 'chat.agentStatus.read.count',
    edit: 'chat.agentStatus.edit.count',
    command: 'chat.agentStatus.command.count',
    delegate: 'chat.agentStatus.delegate.count',
    skill: 'chat.agentStatus.skill.count',
} as const;

const getToolStatus = (toolName: string, count = 1): AgentStatus => {
    const bucket = TOOL_BUCKETS[toolName];
    if (!bucket) return { key: 'chat.agentStatus.usingTool', name: toolName.replace(/[_-]+/g, ' ').trim() };
    const counted = (COUNTED_STATUS as Record<string, string | undefined>)[bucket];
    const single = (BUCKET_STATUS as Record<string, string | undefined>)[bucket];
    if (count > 1 && counted) return { key: counted as AgentStatus['key'], count };
    if (single) return { key: single as AgentStatus['key'] };
    // plan and evaluate are OMP's own tools; the catalogue has no phrase for them.
    return { key: 'chat.agentStatus.usingTool', name: bucket };
};

/** The generic phrase's dictionary key, picked by the same hash as its text. */
const WORKING_STATUS_KEYS = [
    'chat.agentStatus.working',
    'chat.agentStatus.generic.processing',
    'chat.agentStatus.generic.preparing',
    'chat.agentStatus.generic.warmingUp',
    'chat.agentStatus.generic.gearsTurning',
    'chat.agentStatus.generic.computing',
    'chat.agentStatus.generic.calculating',
    'chat.agentStatus.generic.analyzing',
    'chat.agentStatus.generic.wheelsSpinning',
    'chat.agentStatus.generic.calibrating',
    'chat.agentStatus.generic.synthesizing',
    'chat.agentStatus.generic.connectingDots',
    'chat.agentStatus.generic.inspectingLogic',
    'chat.agentStatus.generic.weighingOptions',
] as const;

const getStableWorkingStatus = (key: string): AgentStatus => ({
    key: WORKING_STATUS_KEYS[hashString(key) % WORKING_STATUS_KEYS.length] ?? 'chat.agentStatus.working',
});

const getToolStatusPhrase = (toolName: string, count = 1): string => {
    const bucket = TOOL_BUCKETS[toolName];
    if (!bucket) {
        return `using ${toolName}`;
    }
    const [one, many] = BUCKET_PHRASES[bucket];
    return (count > 1 ? many : one).replace('{count}', String(count));
};

/**
 * Parallel commands are counted together; canonical tool calls do not carry
 * nested execute metadata, so the status remains at the declared tool name.
 */
const getRunningToolPhrase = (toolName: string, count: number): string => getToolStatusPhrase(toolName, count);

const hashString = (value: string): number => {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash);
};

const getStableWorkingPhrase = (key: string): string => {
    return WORKING_PHRASES[hashString(key) % WORKING_PHRASES.length] ?? 'working';
};


export const createParsedStatus = (parts: Part[], genericKey: string): ParsedStatusResult => {
    const runningToolCounts = countRunningToolCalls(parts);
    let activePartType: ParsedStatusResult['activePartType'] = undefined;
    let activeToolName: string | undefined = undefined;
    let activeToolPhrase: string | undefined = undefined;

    for (let index = parts.length - 1; index >= 0; index -= 1) {
        const part = parts[index];
        if (!part) continue;

        switch (part.type) {
            case 'reasoning': {
                // Canonical reasoning parts carry no completion marker. Do not
                // infer that an otherwise settled part is still streaming.
                break;
            }
            case 'tool_call': {
                const toolStatus = part.status;
                if ((toolStatus === 'running' || toolStatus === 'pending_approval' || toolStatus === 'approved') && !activePartType) {
                    const toolName = part.toolName;
                    const bucket = TOOL_BUCKETS[toolName];
                    activePartType = bucket === 'edit' ? 'editing' : 'tool';
                    activeToolName = toolName;
                    activeToolPhrase = getRunningToolPhrase(toolName, runningToolCounts.get(bucket ?? toolName) ?? 1);
                }
                break;
            }
            case 'text': {
                // Canonical text parts carry no completion marker. Keep the
                // neutral status rather than inventing streaming state.
                break;
            }
            default:
                break;
        }
    }

    const isGenericStatus = activePartType === undefined;
    const statusText = (() => {
        if (activePartType === 'editing') return activeToolPhrase ?? 'editing a file';
        if (activePartType === 'tool' && activeToolName) return activeToolPhrase ?? getToolStatusPhrase(activeToolName);
        return getStableWorkingPhrase(genericKey);
    })();
    const status: AgentStatus = isGenericStatus
        ? getStableWorkingStatus(genericKey)
        : activePartType === 'editing'
            ? getToolStatus(activeToolName ?? 'edit', runningToolCounts.get(TOOL_BUCKETS[activeToolName ?? 'edit'] ?? 'edit') ?? 1)
            : activePartType === 'tool' && activeToolName
                ? getToolStatus(activeToolName, runningToolCounts.get(TOOL_BUCKETS[activeToolName] ?? activeToolName) ?? 1)
                : { key: 'chat.agentStatus.composing' };

    return { activePartType, activeToolName, statusText, status, isGenericStatus };
};

const encodeParsedStatus = (status: ParsedStatusResult): string => {
    return [
        status.activePartType ?? '',
        status.activeToolName ?? '',
        status.statusText,
        status.isGenericStatus ? '1' : '0',
        // The key is what the pill localizes; its text is only the fallback.
        JSON.stringify([status.status.key, status.status.count ?? null, status.status.name ?? null]),
    ].join(STATUS_SIGNATURE_SEPARATOR);
};

const decodeParsedStatus = (signature: string): ParsedStatusResult => {
    const [activePartType, activeToolName, statusText = 'working', isGenericStatus, encodedStatus] = signature.split(STATUS_SIGNATURE_SEPARATOR);
    let status: AgentStatus = { key: 'chat.agentStatus.working' };
    if (encodedStatus) {
        try {
            const [key, count, name] = JSON.parse(encodedStatus) as [AgentStatus['key'], number | null, string | null];
            status = { key };
            if (count !== null) status.count = count;
            if (name !== null) status.name = name;
        } catch {
            // A signature from an older build carries no key; the text stands in.
        }
    }
    return {
        activePartType: activePartType === 'text' || activePartType === 'tool' || activePartType === 'reasoning' || activePartType === 'editing'
            ? activePartType
            : undefined,
        activeToolName: activeToolName || undefined,
        statusText,
        status,
        isGenericStatus: isGenericStatus === '1',
    };
};

const getToolDisplayName = (part: ToolCallPart): string => part.toolName;

/**
 * Parallel calls are common (three reads, two shell commands), and the last
 * part alone hides the rest. Count every call that is still running or pending
 * by bucket so the phrase can say "reading 3 files" instead.
 */
const countRunningToolCalls = (parts: readonly Part[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const part of parts) {
        if (part.type !== 'tool_call') continue;
        const status = part.status;
        if (status !== 'running' && status !== 'pending_approval' && status !== 'approved') continue;
        const toolName = getToolDisplayName(part);
        const bucket = TOOL_BUCKETS[toolName] ?? toolName;
        counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }
    return counts;
};

/** True when a user prompt follows `index`, i.e. a turn is queued or starting. */
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
    // Inside the chat column, follow the session the timeline shows rather
    // than the live selection, so the status chip changes together with the
    // conversation instead of a commit ahead of it.
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

    const lastAssistantStatusSignature = useDirectorySync(
        React.useCallback((state) => {
            const genericKey = `${currentSessionId ?? ''}:${lastAssistantId ?? ''}`;
            const parts = lastAssistantId
                ? state.message[currentSessionId ?? '']?.find((message) => message.messageId === lastAssistantId)?.parts ?? EMPTY_PARTS
                : EMPTY_PARTS;
            return encodeParsedStatus(createParsedStatus(parts, genericKey));
        }, [currentSessionId, lastAssistantId]),
        currentSessionDirectory ?? undefined,
    );

    const sessionPermissionRequests = useSessionPermissions(currentSessionId ?? '', currentSessionDirectory ?? undefined);
    const sessionFormRequests = useSessionForms(currentSessionId ?? '', currentSessionDirectory ?? undefined);

    const sessionAbortRecord = useSessionUIStore(
        React.useCallback((state) => {
            if (!currentSessionId) {
                return null;
            }
            return state.sessionAbortFlags?.get(currentSessionId) ?? null;
        }, [currentSessionId])
    );

    const { phase: activityPhase, isWorking: isPhaseWorking } = useSessionActivity(currentSessionId, currentSessionDirectory ?? undefined);


    const parsedStatus = React.useMemo<ParsedStatusResult>(() => {
        return decodeParsedStatus(lastAssistantStatusSignature);
    }, [lastAssistantStatusSignature]);

    const abortState = React.useMemo(() => {
        const hasActiveAbort = Boolean(sessionAbortRecord && !sessionAbortRecord.acknowledged);
        return { wasAborted: hasActiveAbort, abortActive: hasActiveAbort };
    }, [sessionAbortRecord]);

    const baseWorking = React.useMemo<WorkingSummary>(() => {

        if (abortState.wasAborted) {
            return {
                ...DEFAULT_WORKING,
                wasAborted: true,
                abortActive: abortState.abortActive,
                activity: 'idle',
                hasWorkingContext: false,
                isWorking: false,
                isStreaming: false,
                isCooldown: false,
                statusText: null,
                canAbort: false,
                retryInfo: null,
            };
        }

        const isWorking = isPhaseWorking;
        const isStreaming = activityPhase === 'busy';
        const isCooldown = false;
        // Canonical runtime status does not expose retry timing or attempts.

        let activity: AssistantActivity = 'idle';
        if (isWorking) {
            if (parsedStatus.activePartType === 'tool' || parsedStatus.activePartType === 'editing') {
                activity = 'tooling';
            } else {
                activity = isCooldown ? 'cooldown' : 'streaming';
            }
        }

        const retryInfo = null;

        return {
            activity,
            hasWorkingContext: isWorking,
            hasActiveTools: parsedStatus.activePartType === 'tool' || parsedStatus.activePartType === 'editing',
            isWorking,
            isStreaming,
            isCooldown,
            lifecyclePhase: isStreaming ? 'streaming' : isCooldown ? 'cooldown' : null,
            statusText: isWorking ? parsedStatus.statusText : null,
            status: isWorking ? parsedStatus.status : null,
            isGenericStatus: isWorking ? parsedStatus.isGenericStatus : true,
            isWaitingForPermission: false,
            canAbort: isWorking,
            compactionDeadline: null,
            activePartType: isWorking ? parsedStatus.activePartType : undefined,
            activeToolName: isWorking ? parsedStatus.activeToolName : undefined,
            wasAborted: false,
            abortActive: false,
            lastCompletionId: null,
            isComplete: false,
            retryInfo,
        };
    }, [activityPhase, isPhaseWorking, parsedStatus, abortState]);

    const forming = React.useMemo<FormingSummary>(() => {
        const isActive = isPhaseWorking && parsedStatus.activePartType === 'text';
        return { isActive, characterCount: 0 };
    }, [isPhaseWorking, parsedStatus.activePartType]);

    const working = React.useMemo<WorkingSummary>(() => {
        if (baseWorking.wasAborted || baseWorking.abortActive) {
            return baseWorking;
        }

        const hasPendingPermission = sessionPermissionRequests.length > 0;
        const hasPendingForm = sessionFormRequests.length > 0;

        if (!hasPendingPermission && !hasPendingForm) {
            return baseWorking;
        }

        if (hasPendingForm) {
            return {
                ...baseWorking,
                statusText: null,
                isWorking: false,
                hasWorkingContext: false,
                hasActiveTools: false,
                canAbort: false,
                activePartType: undefined,
                activeToolName: undefined,
                retryInfo: null,
            };
        }

        return {
            ...baseWorking,
            statusText: 'waiting for permission',
            status: { key: 'chat.agentStatus.waitingPermission' },
            isWaitingForPermission: true,
            canAbort: false,
            retryInfo: null,
        };
    }, [baseWorking, sessionPermissionRequests, sessionFormRequests]);

    return {
        activeModel: activeAssistant.model,
        forming,
        working,
    };
}
