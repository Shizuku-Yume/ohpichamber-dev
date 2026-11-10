import React from 'react';
import { useChatSessionSelection } from '@/components/chat/chatColumnSession';
import type { Message, Part, ToolCallPart } from '@openchamber/agent-contract';

import type { MessageStreamPhase } from '@/stores/types/sessionTypes';
<<<<<<< HEAD
=======
import { selectMcpServersForDirectory, useMcpConfigStore } from '@/stores/useMcpConfigStore';
import { useGlobalBlockingRequestsStore } from '@/sync/global-blocking-requests';
>>>>>>> bc50ba56a
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useDirectorySync, useSessionMessages, useSessionPermissions, useSessionForms } from '@/sync/sync-context';
import { useSessionActivity } from './useSessionActivity';
import type { AgentStatus } from '@/lib/agentStatus';
<<<<<<< HEAD
=======
import type { I18nKey } from '@/lib/i18n';
>>>>>>> bc50ba56a

type AssistantActivity = 'idle' | 'streaming' | 'tooling' | 'cooldown' | 'permission';

interface WorkingSummary {
    activity: AssistantActivity;
    hasWorkingContext: boolean;
    hasActiveTools: boolean;
    isWorking: boolean;
    isStreaming: boolean;
    isCooldown: boolean;
    lifecyclePhase: MessageStreamPhase | null;
<<<<<<< HEAD
    statusText: string | null;
    /** The same activity as a dictionary key, so the pill and status row localize it. */
=======
    /** What the agent is doing, as a dictionary key; `formatAgentStatus` makes the text. */
>>>>>>> bc50ba56a
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
<<<<<<< HEAD
    statusText: null,
=======
>>>>>>> bc50ba56a
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

<<<<<<< HEAD
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
=======
// [one call, several calls]. The counted phrase takes the number of parallel
// calls in the bucket. A search spans many files in one call, so it is not counted.
const BUCKET_STATUS = {
    read: ['chat.agentStatus.read', 'chat.agentStatus.read.count'],
    search: ['chat.agentStatus.search', 'chat.agentStatus.search'],
    edit: ['chat.agentStatus.edit', 'chat.agentStatus.edit.count'],
    command: ['chat.agentStatus.command', 'chat.agentStatus.command.count'],
    lookup: ['chat.agentStatus.lookup', 'chat.agentStatus.lookup'],
    delegate: ['chat.agentStatus.delegate', 'chat.agentStatus.delegate.count'],
    question: ['chat.agentStatus.question', 'chat.agentStatus.question'],
    skill: ['chat.agentStatus.skill', 'chat.agentStatus.skill.count'],
} satisfies Record<ToolBucket, readonly [I18nKey, I18nKey]>;

// Shown while no part says what the turn does; one per turn, picked by its key.
const WORKING_STATUS: readonly I18nKey[] = [
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
>>>>>>> bc50ba56a
];

const status = (key: I18nKey): AgentStatus => ({ key });

type ParsedStatusResult = {
    activePartType: 'text' | 'tool' | 'reasoning' | 'editing' | undefined;
    activeToolName: string | undefined;
<<<<<<< HEAD
    statusText: string;
=======
>>>>>>> bc50ba56a
    status: AgentStatus;
    isGenericStatus: boolean;
};

<<<<<<< HEAD
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
=======
// OpenChamber's own tools each do several kinds of work behind one name, so
// the status follows the call's `action`. The fallback covers the remaining
// actions and any added later; the tool name never reaches the pill.
type ToolActionStatus = { fallback: I18nKey; actions?: Record<string, I18nKey> };

const OPENCHAMBER_STATUS = new Map(Object.entries<ToolActionStatus>({
    openchamber: {
        fallback: 'chat.agentStatus.sessions.manage',
        actions: {
            'projects.list': 'chat.agentStatus.sessions.projects',
            'models.list': 'chat.agentStatus.sessions.models',
            'models.search': 'chat.agentStatus.sessions.models',
            'session.list': 'chat.agentStatus.sessions.list',
            'session.status': 'chat.agentStatus.sessions.status',
            'session.messages': 'chat.agentStatus.sessions.messages',
            'session.create': 'chat.agentStatus.sessions.create',
            'session.send': 'chat.agentStatus.sessions.send',
            'session.fork': 'chat.agentStatus.sessions.fork',
            'session.moveToWorktree': 'chat.agentStatus.sessions.moveToWorktree',
            'session.link': 'chat.agentStatus.sessions.link',
            'session.markDone': 'chat.agentStatus.sessions.markDone',
            'session.track': 'chat.agentStatus.sessions.track',
            'file.open': 'chat.agentStatus.sessions.openFile',
        },
    },
    openchamber_schedule: {
        fallback: 'chat.agentStatus.schedule.update',
        actions: {
            'schedule.list': 'chat.agentStatus.schedule.list',
            'schedule.run': 'chat.agentStatus.schedule.run',
        },
    },
    openchamber_web: {
        fallback: 'chat.agentStatus.browser.use',
        actions: {
            'browser.open': 'chat.agentStatus.browser.open',
            'browser.snapshot': 'chat.agentStatus.browser.read',
            'browser.inspect': 'chat.agentStatus.browser.inspect',
            'browser.capture': 'chat.agentStatus.browser.capture',
            'browser.close': 'chat.agentStatus.browser.close',
        },
    },
    openchamber_memory: {
        fallback: 'chat.agentStatus.memory.check',
        actions: {
            'memory.save': 'chat.agentStatus.memory.save',
            'memory.delete': 'chat.agentStatus.memory.delete',
        },
    },
    openchamber_knowledge: {
        fallback: 'chat.agentStatus.knowledge.check',
        actions: {
            'knowledge.save': 'chat.agentStatus.knowledge.update',
            'knowledge.delete': 'chat.agentStatus.knowledge.update',
            'knowledge.show': 'chat.agentStatus.knowledge.showPlan',
        },
    },
    openchamber_notify: { fallback: 'chat.agentStatus.notify' },
    openchamber_usage: { fallback: 'chat.agentStatus.usage' },
    openchamber_render: { fallback: 'chat.agentStatus.render' },
    openchamber_image: { fallback: 'chat.agentStatus.image' },
    openchamber_secret: { fallback: 'chat.agentStatus.secret', actions: { 'secret.run': 'chat.agentStatus.secretRun' } },
}));

/**
 * `running` tells a page that waits for the user's answer apart from one the
 * model is still writing: the call runs until the user picks.
 */
const getOpenChamberStatus = (call: OpenChamberToolCall, running: boolean): AgentStatus => {
    if (call.awaitsAnswer && running) return status('chat.agentStatus.waitingAnswer');
    const known = OPENCHAMBER_STATUS.get(call.tool);
    return status((call.action ? known?.actions?.[call.action] : undefined) ?? known?.fallback ?? 'chat.agentStatus.working');
};

// The `opencode` namespace: OpenCode managing itself.
const OPENCODE_NAMESPACE_STATUS = new Map(Object.entries<I18nKey>({
    session_rename: 'chat.agentStatus.sessions.rename',
    session_move: 'chat.agentStatus.sessions.move',
    worktree_create: 'chat.agentStatus.worktree.create',
    worktree_list: 'chat.agentStatus.worktree.list',
    worktree_remove: 'chat.agentStatus.worktree.remove',
    models: 'chat.agentStatus.sessions.models',
    list_mcp_resources: 'chat.agentStatus.mcp.listResources',
    read_mcp_resource: 'chat.agentStatus.mcp.readResource',
    schedule_create: 'chat.agentStatus.opencode.schedules',
    schedule_list: 'chat.agentStatus.opencode.schedules',
    schedule_pause: 'chat.agentStatus.opencode.schedules',
    schedule_resume: 'chat.agentStatus.opencode.schedules',
    schedule_delete: 'chat.agentStatus.opencode.schedules',
    artifact_create: 'chat.agentStatus.opencode.artifacts',
    artifact_read: 'chat.agentStatus.opencode.artifacts',
    artifact_update: 'chat.agentStatus.opencode.artifacts',
    artifact_delete: 'chat.agentStatus.opencode.artifacts',
}));
>>>>>>> bc50ba56a

const getStableWorkingStatus = (key: string): AgentStatus => ({
    key: WORKING_STATUS_KEYS[hashString(key) % WORKING_STATUS_KEYS.length] ?? 'chat.agentStatus.working',
});

<<<<<<< HEAD
const getToolStatusPhrase = (toolName: string, count = 1): string => {
    const bucket = TOOL_BUCKETS[toolName];
    if (!bucket) {
        return `using ${toolName}`;
    }
    const [one, many] = BUCKET_PHRASES[bucket];
    return (count > 1 ? many : one).replace('{count}', String(count));
=======
const usingTool = (name: string): AgentStatus => ({ key: 'chat.agentStatus.usingTool', name: asWords(name) });

const getToolStatus = (toolName: string, count = 1): AgentStatus => {
    const bucket = TOOL_BUCKETS.get(toolName);
    // A plugin tool nobody described: its name, read as words.
    if (!bucket) return usingTool(toolName);
    const [one, many] = BUCKET_STATUS[bucket];
    return count > 1 && many !== one ? { key: many, count } : status(one);
>>>>>>> bc50ba56a
};

/**
 * Parallel commands are counted together; canonical tool calls do not carry
 * nested execute metadata, so the status remains at the declared tool name.
 */
<<<<<<< HEAD
const getRunningToolPhrase = (toolName: string, count: number): string => getToolStatusPhrase(toolName, count);
=======
const getNamedToolStatus = (
    toolName: string,
    input: JsonValue | undefined,
    running: boolean,
    mcpServers: readonly string[],
): AgentStatus | undefined => {
    const ownCall = openChamberToolCall(toolName, input);
    if (ownCall) return getOpenChamberStatus(ownCall, running);
    const opencodeTool = opencodeNamespaceTool(toolName);
    if (opencodeTool) {
        const key = OPENCODE_NAMESPACE_STATUS.get(opencodeTool);
        return key ? status(key) : undefined;
    }
    const server = mcpToolServer(toolName, mcpServers);
    return server ? usingTool(server) : undefined;
};

/**
 * A running `execute` (Code Mode) script names the tool it is calling as soon
 * as its metadata lists one, so the pill tracks the script's real work instead
 * of sitting on a generic status for its whole run. Parallel commands are the
 * exception: one call's name cannot speak for several, so they count instead.
 */
/**
 * A secret call keeps running after the user answered, while its command runs,
 * so it waits on the user only while the server announces its card as waiting
 * (`waitingCalls`, the session's waiting pages). Without that list a running
 * call counts as waiting.
 */
const getRunningToolStatus = (part: ToolPart, toolName: string, count: number, mcpServers: readonly string[], waitingCalls?: ReadonlySet<string>): AgentStatus => {
    const state = part.state;
    const running = state?.status === 'running'
        && (!waitingCalls || part.tool !== 'openchamber_secret' || waitingCalls.has(part.callID));
    const named = getNamedToolStatus(toolName, state?.input, running, mcpServers);
    if (named) {
        return named;
    }
    if (!isExecuteTool(toolName) || count > 1) {
        return getToolStatus(toolName, count);
    }
    const last = lastExecuteToolCall(state && 'metadata' in state ? state.metadata : undefined);
    if (!last) {
        return getToolStatus(toolName);
    }
    return getNamedToolStatus(last.tool, last.input, false, mcpServers) ?? getToolStatus(last.tool);
};
>>>>>>> bc50ba56a

const hashString = (value: string): number => {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash);
};

const getStableWorkingStatus = (key: string): AgentStatus => {
    return status(WORKING_STATUS[hashString(key) % WORKING_STATUS.length] ?? 'chat.agentStatus.working');
};


<<<<<<< HEAD
export const createParsedStatus = (parts: Part[], genericKey: string): ParsedStatusResult => {
=======
/** `mcpServers`: the configured MCP server names, which name the integration an MCP tool comes from. */
export const createParsedStatus = (parts: Part[], genericKey: string, mcpServers: readonly string[] = [], waitingCalls?: ReadonlySet<string>): ParsedStatusResult => {
>>>>>>> bc50ba56a
    const runningToolCounts = countRunningToolCalls(parts);
    let activePartType: ParsedStatusResult['activePartType'] = undefined;
    let activeToolName: string | undefined = undefined;
    let activeToolStatus: AgentStatus | undefined = undefined;
    let activeReasoningId: string | undefined = undefined;

    for (let index = parts.length - 1; index >= 0; index -= 1) {
        const part = parts[index];
        if (!part) continue;

        switch (part.type) {
            case 'reasoning': {
<<<<<<< HEAD
                // Canonical reasoning parts carry no completion marker. Do not
                // infer that an otherwise settled part is still streaming.
=======
                const time = part.time ?? getPartTimeInfo(part);
                const stillRunning = !time || typeof time.end === 'undefined';
                if (stillRunning && !activePartType) {
                    activePartType = 'reasoning';
                    activeReasoningId = part.id;
                }
>>>>>>> bc50ba56a
                break;
            }
            case 'tool_call': {
                const toolStatus = part.status;
                if ((toolStatus === 'running' || toolStatus === 'pending_approval' || toolStatus === 'approved') && !activePartType) {
                    const toolName = part.toolName;
                    const bucket = TOOL_BUCKETS[toolName];
                    activePartType = bucket === 'edit' ? 'editing' : 'tool';
                    activeToolName = toolName;
<<<<<<< HEAD
                    activeToolPhrase = getRunningToolPhrase(toolName, runningToolCounts.get(bucket ?? toolName) ?? 1);
=======
                    activeToolStatus = getRunningToolStatus(part, toolName, runningToolCounts.get(bucket ?? toolName) ?? 1, mcpServers, waitingCalls);
>>>>>>> bc50ba56a
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
<<<<<<< HEAD
    const statusText = (() => {
        if (activePartType === 'editing') return activeToolPhrase ?? 'editing a file';
        if (activePartType === 'tool' && activeToolName) return activeToolPhrase ?? getToolStatusPhrase(activeToolName);
        return getStableWorkingPhrase(genericKey);
=======
    const resolved = ((): AgentStatus => {
        if (activePartType === 'editing') return activeToolStatus ?? status('chat.agentStatus.edit');
        if (activePartType === 'tool' && activeToolName) return activeToolStatus ?? getToolStatus(activeToolName);
        if (activePartType === 'reasoning') {
            const thinking: AgentStatus = { key: 'chat.agentStatus.thinking' };
            if (activeReasoningId) thinking.seed = activeReasoningId;
            return thinking;
        }
        if (activePartType === 'text') return status('chat.agentStatus.composing');
        return getStableWorkingStatus(genericKey);
>>>>>>> bc50ba56a
    })();
    const status: AgentStatus = isGenericStatus
        ? getStableWorkingStatus(genericKey)
        : activePartType === 'editing'
            ? getToolStatus(activeToolName ?? 'edit', runningToolCounts.get(TOOL_BUCKETS[activeToolName ?? 'edit'] ?? 'edit') ?? 1)
            : activePartType === 'tool' && activeToolName
                ? getToolStatus(activeToolName, runningToolCounts.get(TOOL_BUCKETS[activeToolName] ?? activeToolName) ?? 1)
                : { key: 'chat.agentStatus.composing' };

<<<<<<< HEAD
    return { activePartType, activeToolName, statusText, status, isGenericStatus };
=======
    return { activePartType, activeToolName, status: resolved, isGenericStatus, canBackground: hasBackgroundableWork(parts) };
>>>>>>> bc50ba56a
};

const encodeParsedStatus = (status: ParsedStatusResult): string => {
    return [
        status.activePartType ?? '',
        status.activeToolName ?? '',
        // The signature decides re-renders: equal statuses encode the same.
        JSON.stringify([status.status.key, status.status.count ?? null, status.status.name ?? null, status.status.seed ?? null]),
        status.isGenericStatus ? '1' : '0',
        // The key is what the pill localizes; its text is only the fallback.
        JSON.stringify([status.status.key, status.status.count ?? null, status.status.name ?? null]),
    ].join(STATUS_SIGNATURE_SEPARATOR);
};

const decodeStatus = (encoded: string | undefined): AgentStatus => {
    if (!encoded) return { key: 'chat.agentStatus.working' };
    // SAFETY: `encodeParsedStatus` wrote this tuple from an AgentStatus, and the
    // signature only travels from that encoder to this decoder.
    const [key, count, name, seed] = JSON.parse(encoded) as [I18nKey, number | null, string | null, string | null];
    const decoded: AgentStatus = { key };
    if (count !== null) decoded.count = count;
    if (name !== null) decoded.name = name;
    if (seed !== null) decoded.seed = seed;
    return decoded;
};

const decodeParsedStatus = (signature: string): ParsedStatusResult => {
<<<<<<< HEAD
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
=======
    const [activePartType, activeToolName, encodedStatus, isGenericStatus, canBackground] = signature.split(STATUS_SIGNATURE_SEPARATOR);
>>>>>>> bc50ba56a
    return {
        activePartType: activePartType === 'text' || activePartType === 'tool' || activePartType === 'reasoning' || activePartType === 'editing'
            ? activePartType
            : undefined,
        activeToolName: activeToolName || undefined,
<<<<<<< HEAD
        statusText,
        status,
=======
        status: decodeStatus(encodedStatus),
>>>>>>> bc50ba56a
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

<<<<<<< HEAD
    const lastAssistantStatusSignature = useDirectorySync(
        React.useCallback((state) => {
            const genericKey = `${currentSessionId ?? ''}:${lastAssistantId ?? ''}`;
            const parts = lastAssistantId
                ? state.message[currentSessionId ?? '']?.find((message) => message.messageId === lastAssistantId)?.parts ?? EMPTY_PARTS
                : EMPTY_PARTS;
            return encodeParsedStatus(createParsedStatus(parts, genericKey));
        }, [currentSessionId, lastAssistantId]),
=======
    // An MCP tool's name starts with its server's name, and only the configured
    // names can split it. Reading the config touches no running server.
    const mcpServerConfigs = useMcpConfigStore((state) => selectMcpServersForDirectory(state, currentSessionDirectory));
    const loadMcpConfigs = useMcpConfigStore((state) => state.loadMcpConfigs);
    React.useEffect(() => {
        void loadMcpConfigs({ directory: currentSessionDirectory });
    }, [currentSessionDirectory, loadMcpConfigs]);
    const mcpServers = React.useMemo(() => mcpServerConfigs.map((server) => server.name), [mcpServerConfigs]);

    // The calls whose page or secret card waits for the user, as one stable string.
    const waitingCallIds = useGlobalBlockingRequestsStore(React.useCallback(
        (state) => (currentSessionId ? state.bySession.get(currentSessionId)?.pages.map((page) => page.id).join('\n') ?? '' : ''),
        [currentSessionId],
    ));
    const waitingCalls = React.useMemo(() => new Set(waitingCallIds ? waitingCallIds.split('\n') : []), [waitingCallIds]);
    const lastAssistantStatusSignature = useDirectorySync(
        React.useCallback((state) => {
            const genericKey = `${currentSessionId ?? ''}:${lastAssistantId ?? ''}`;
            const parts = lastAssistantId ? (state.part[lastAssistantId] ?? EMPTY_PARTS) : EMPTY_PARTS;
            return encodeParsedStatus(createParsedStatus(parts, genericKey, mcpServers, waitingCalls));
        }, [currentSessionId, lastAssistantId, mcpServers, waitingCalls]),
>>>>>>> bc50ba56a
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
                status: null,
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
<<<<<<< HEAD
            statusText: isWorking ? parsedStatus.statusText : null,
=======
>>>>>>> bc50ba56a
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
                status: null,
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
<<<<<<< HEAD
            statusText: 'waiting for permission',
            status: { key: 'chat.agentStatus.waitingPermission' },
=======
            status: status('chat.agentStatus.waitingPermission'),
>>>>>>> bc50ba56a
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
