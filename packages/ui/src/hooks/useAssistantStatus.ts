import React from 'react';
import { useChatSessionSelection } from '@/components/chat/chatColumnSession';
import type { Message, Part, ReasoningPart, TextPart, ToolCallPart } from '@openchamber/agent-contract';
import { isShellTool, isSubagentTool } from '@/lib/opencode/tools';

import type { MessageStreamPhase } from '@/stores/types/sessionTypes';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSessionMessages, useSessionPermissions, useSessionForms } from '@/sync/sync-context';
import { useSessionActivity } from './useSessionActivity';

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
    /**
     * The turn waits on work OpenCode can move to the background: a running
     * shell command or a subagent it delegated to (`session.background`).
     */
    canBackground: boolean;
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
    message: Message | null;
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
    canBackground: false,
};

const EMPTY_PARTS: Part[] = [];
const STATUS_SIGNATURE_SEPARATOR = '\u0000';

type ToolBucket = 'read' | 'search' | 'edit' | 'command' | 'lookup' | 'delegate' | 'question' | 'skill';

// Several tools share one phrase, so parallel calls of the same kind can be
// counted together ("reading 3 files"). The timeline names the exact tool.
// v2 tool names: `shell` replaced `bash`, `subagent` replaced `task`, and
// `todowrite`/`todoread`/`list`/`lsp` are gone.
const TOOL_BUCKETS = new Map<string, ToolBucket>(Object.entries({
    read: 'read',
    'file-diff': 'read',
    grep: 'search',
    glob: 'search',
    edit: 'edit',
    write: 'edit',
    patch: 'edit',
    shell: 'command',
    execute: 'command',
    webfetch: 'lookup',
    websearch: 'lookup',
    codesearch: 'lookup',
    subagent: 'delegate',
    question: 'question',
    skill: 'skill',
} satisfies Record<string, ToolBucket>));

// [one call, several calls]; `{count}` becomes the number of parallel calls in
// the bucket. A search spans many files in one call, so it is not counted.
const BUCKET_PHRASES = {
    read: ['reading a file', 'reading {count} files'],
    search: ['searching files', 'searching files'],
    edit: ['editing a file', 'editing {count} files'],
    command: ['running a command', 'running {count} commands'],
    lookup: ['looking things up', 'looking things up'],
    delegate: ['handing off a task', 'handing off {count} tasks'],
    question: ['asking a question', 'asking a question'],
    skill: ['picking up a skill', 'picking up {count} skills'],
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
    isGenericStatus: boolean;
    canBackground: boolean;
};

const getToolStatusPhrase = (toolName: string, count = 1): string => {
    const bucket = TOOL_BUCKETS.get(toolName);
    if (!bucket) {
        return `using ${toolName}`;
    }
    const [one, many] = BUCKET_PHRASES[bucket];
    return (count > 1 ? many : one).replace('{count}', String(count));
};

/**
 * A running `execute` (Code Mode) script names the tool it is calling as soon
 * as its metadata lists one, so the pill tracks the script's real work instead
 * of sitting on a generic phrase for its whole run. Parallel commands are the
 * exception: one call's name cannot speak for several, so they count instead.
 */

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

/**
 * The turn waits on a job OpenCode can move to the background: a shell command
 * or a subagent call that already runs. A pending call has not started yet (or
 * waits for a permission), and a background call settles at once, so neither
 * counts.
 */
export const hasBackgroundableWork = (parts: readonly Part[]): boolean => parts.some((part) => (
    part.type === 'tool_call'
    && part.status === 'running'
    && (isShellTool(part.toolName) || isSubagentTool(part.toolName))
));

export const createParsedStatus = (parts: Part[], genericKey: string): ParsedStatusResult => {
    const runningToolCounts = countRunningToolCalls(parts);
    let activePartType: ParsedStatusResult['activePartType'];
    let activeToolName: string | undefined;
    let activeToolPhrase: string | undefined;
    for (let index = parts.length - 1; index >= 0; index -= 1) {
        const part = parts[index];
        if (!part) continue;
        if (isReasoningPart(part)) {
            if (!activePartType && part.content.trim()) activePartType = 'reasoning';
            continue;
        }
        if (part.type === 'tool_call') {
            if ((part.status === 'running' || part.status === 'pending_approval') && !activePartType) {
                activeToolName = getToolDisplayName(part);
                const bucket = TOOL_BUCKETS.get(activeToolName);
                activePartType = bucket === 'edit' ? 'editing' : 'tool';
                activeToolPhrase = getToolStatusPhrase(activeToolName, runningToolCounts.get(bucket ?? activeToolName) ?? 1);
            }
            continue;
        }
        if (isTextPart(part) && part.content.trim() && !activePartType) activePartType = 'text';
    }
    const isGenericStatus = activePartType === undefined;
    const statusText = activePartType === 'editing'
        ? activeToolPhrase ?? 'editing a file'
        : activePartType === 'tool' && activeToolName
            ? activeToolPhrase ?? getToolStatusPhrase(activeToolName)
            : activePartType === 'reasoning' ? 'thinking'
                : activePartType === 'text' ? 'composing' : getStableWorkingPhrase(genericKey);
    return { activePartType, activeToolName, statusText, isGenericStatus, canBackground: hasBackgroundableWork(parts) };
};

const encodeParsedStatus = (status: ParsedStatusResult): string => {
    return [
        status.activePartType ?? '',
        status.activeToolName ?? '',
        status.statusText,
        status.isGenericStatus ? '1' : '0',
        status.canBackground ? '1' : '0',
    ].join(STATUS_SIGNATURE_SEPARATOR);
};

const decodeParsedStatus = (signature: string): ParsedStatusResult => {
    const [activePartType, activeToolName, statusText = 'working', isGenericStatus, canBackground] = signature.split(STATUS_SIGNATURE_SEPARATOR);
    return {
        activePartType: activePartType === 'text' || activePartType === 'tool' || activePartType === 'reasoning' || activePartType === 'editing'
            ? activePartType
            : undefined,
        activeToolName: activeToolName || undefined,
        statusText,
        isGenericStatus: isGenericStatus === '1',
        canBackground: canBackground === '1',
    };
};

const isReasoningPart = (part: Part): part is ReasoningPart => part.type === 'reasoning';

const isTextPart = (part: Part): part is TextPart => part.type === 'text';

const getTextContent = (part: TextPart): string => part.content;

const getToolDisplayName = (part: ToolCallPart): string => part.toolName;

const getPartTimeInfo = (_part: Part): { end?: number } | undefined => undefined;

/**
 * Parallel calls are common (three reads, two shell commands), and the last
 * part alone hides the rest. Count every call that is still running or pending
 * by bucket so the phrase can say "reading 3 files" instead.
 */
const countRunningToolCalls = (parts: readonly Part[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const part of parts) {
        if (part.type !== 'tool_call') continue;
        if (part.status !== 'running' && part.status !== 'pending_approval') continue;
        const toolName = getToolDisplayName(part);
        const bucket = TOOL_BUCKETS.get(toolName) ?? toolName;
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
 * Parallel calls are common (three reads, two shell commands), and the last
 * part alone hides the rest. Count every call that is still running or pending
 * by bucket so the phrase can say "reading 3 files" instead.
 */
const countRunningToolCalls = (parts: readonly Part[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const part of parts) {
        if (part.type !== 'tool_call') continue;
        if (part.status !== 'running' && part.status !== 'pending_approval') continue;
        const toolName = getToolDisplayName(part);
        const bucket = TOOL_BUCKETS.get(toolName) ?? toolName;
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

export const getActiveAssistantContext = (messages: Message[]): ActiveAssistantContext => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message?.role !== 'assistant') continue;
        const providerId = message.providerId?.trim() ?? '';
        const modelId = message.modelId?.trim() ?? '';
        return { assistantId: message.messageId, model: providerId && modelId ? { providerId, modelId } : null, message };
    }
    return { assistantId: null, model: null, message: null };
};

export function useAssistantStatus(): AssistantStatusSnapshot {
    const { sessionId: currentSessionId, directory: currentSessionDirectory } = useChatSessionSelection();
    const rawSessionMessages = useSessionMessages(currentSessionId ?? '', currentSessionDirectory ?? undefined);
    const activeAssistant = React.useMemo(
        () => getActiveAssistantContext(rawSessionMessages),
        [rawSessionMessages],
    );
    const lastAssistantId = activeAssistant.assistantId;
    const lastAssistantStatusSignature = React.useMemo(() => {
        const genericKey = `${currentSessionId ?? ''}:${lastAssistantId ?? ''}`;
        return encodeParsedStatus(createParsedStatus(activeAssistant.message?.parts ?? EMPTY_PARTS, genericKey));
    }, [activeAssistant.message, currentSessionId, lastAssistantId]);

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

        let activity: AssistantActivity = 'idle';
        if (isWorking) {
            activity = parsedStatus.activePartType === 'tool' || parsedStatus.activePartType === 'editing'
                ? 'tooling' : isCooldown ? 'cooldown' : 'streaming';
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
            canBackground: isWorking && parsedStatus.canBackground,
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
                canBackground: false,
            };
        }

        return {
            ...baseWorking,
            statusText: 'waiting for permission',
            isWaitingForPermission: true,
            canAbort: false,
            retryInfo: null,
            canBackground: false,
        };
    }, [baseWorking, sessionPermissionRequests, sessionFormRequests]);

    return {
        activeModel: activeAssistant.model,
        forming,
        working,
    };
}
