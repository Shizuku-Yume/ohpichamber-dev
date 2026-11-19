import React from 'react';
import { useChatSessionSelection } from '@/components/chat/chatColumnSession';
import type { Message, Part, ToolCallPart } from '@openchamber/agent-contract';

import { useSessionUIStore } from '@/sync/session-ui-store';
<<<<<<< HEAD
import { useDirectorySync, useSessionCompacting, useSessionMessages, useSessionPermissions, useSessionForms } from '@/sync/sync-context';
||||||| bc50ba56aa
import { useDirectorySync, useSession, useSessionMessages, useSessionPermissions, useSessionForms, useSessionStatus } from '@/sync/sync-context';
=======
import { formTurnHold, useRecoverableQuestionsStore } from '@/sync/recoverable-questions';
import { useDirectorySync, useSession, useSessionMessages, useSessionPermissions, useSessionStatus } from '@/sync/sync-context';
>>>>>>> upstream/main
import { useSessionActivity } from './useSessionActivity';
import type { AgentStatus } from '@/lib/agentStatus';
import { normalizeIntent, toolPresentation } from '@/lib/toolPresentation';

interface WorkingSummary {
    isWorking: boolean;
<<<<<<< HEAD
    /** The status row's and the pill's localized phrase. */
||||||| bc50ba56aa
    isStreaming: boolean;
    isCooldown: boolean;
    lifecyclePhase: MessageStreamPhase | null;
    /** What the agent is doing, as a dictionary key; `formatAgentStatus` makes the text. */
=======
    isStreaming: boolean;
    isCooldown: boolean;
    lifecyclePhase: MessageStreamPhase | null;
>>>>>>> upstream/main
    status: AgentStatus | null;
    isWaitingForPermission: boolean;
    abortActive: boolean;
<<<<<<< HEAD
    /** The retry the run is waiting on, from its newest `auto_retry_start` notice. */
    retryInfo: { attempt?: number; maxAttempts?: number; next?: number } | null;
||||||| bc50ba56aa
    lastCompletionId: string | null;
    isComplete: boolean;
    retryInfo: { attempt?: number; next?: number; resetsAt?: number } | null;
    /**
     * The turn waits on work OpenCode can move to the background: a running
     * shell command or a subagent it delegated to (`session.background`),
     * including one running inside a Code Mode `execute` call.
     */
    canBackground: boolean;
=======
    lastCompletionId: string | null;
    isComplete: boolean;
    retryInfo: { attempt?: number; next?: number; resetsAt?: number } | null;
    canBackground: boolean;
>>>>>>> upstream/main
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

<<<<<<< HEAD
export type ParsedStatusResult = {
||||||| bc50ba56aa
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
];

const status = (key: I18nKey): AgentStatus => ({ key });

type ParsedStatusResult = {
    activePartType: 'text' | 'tool' | 'reasoning' | 'editing' | undefined;
    activeToolName: string | undefined;
=======
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
];

const status = (key: I18nKey): AgentStatus => ({ key });

type ParsedStatusResult = {
    activePartType: 'text' | 'tool' | 'reasoning' | 'editing' | undefined;
    activeToolName: string | undefined;
>>>>>>> upstream/main
    status: AgentStatus;
<<<<<<< HEAD
    /** True when the run is writing its answer rather than naming a call. */
    isAnswering: boolean;
||||||| bc50ba56aa
    isGenericStatus: boolean;
    canBackground: boolean;
};

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

const asWords = (name: string): string => name.replace(/[_-]+/g, ' ').trim();

const usingTool = (name: string): AgentStatus => ({ key: 'chat.agentStatus.usingTool', name: asWords(name) });

const getToolStatus = (toolName: string, count = 1): AgentStatus => {
    const bucket = TOOL_BUCKETS.get(toolName);
    // A plugin tool nobody described: its name, read as words.
    if (!bucket) return usingTool(toolName);
    const [one, many] = BUCKET_STATUS[bucket];
    return count > 1 && many !== one ? { key: many, count } : status(one);
=======
    isGenericStatus: boolean;
    canBackground: boolean;
};

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
            'session.unlink': 'chat.agentStatus.sessions.unlink',
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

const getOpenChamberStatus = (call: OpenChamberToolCall, running: boolean): AgentStatus => {
    if (call.awaitsAnswer && running) return status('chat.agentStatus.waitingAnswer');
    const known = OPENCHAMBER_STATUS.get(call.tool);
    return status((call.action ? known?.actions?.[call.action] : undefined) ?? known?.fallback ?? 'chat.agentStatus.working');
};

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
    automation_create: 'chat.agentStatus.opencode.automations',
    automation_list: 'chat.agentStatus.opencode.automations',
    automation_pause: 'chat.agentStatus.opencode.automations',
    automation_resume: 'chat.agentStatus.opencode.automations',
    automation_delete: 'chat.agentStatus.opencode.automations',
    artifact_create: 'chat.agentStatus.opencode.artifacts',
    artifact_read: 'chat.agentStatus.opencode.artifacts',
    artifact_update: 'chat.agentStatus.opencode.artifacts',
    artifact_delete: 'chat.agentStatus.opencode.artifacts',
}));

const asWords = (name: string): string => name.replace(/[_-]+/g, ' ').trim();

const usingTool = (name: string): AgentStatus => ({ key: 'chat.agentStatus.usingTool', name: asWords(name) });

const getToolStatus = (toolName: string, count = 1): AgentStatus => {
    const bucket = TOOL_BUCKETS.get(toolName);
    if (!bucket) return usingTool(toolName);
    const [one, many] = BUCKET_STATUS[bucket];
    return count > 1 && many !== one ? { key: many, count } : status(one);
>>>>>>> upstream/main
};

<<<<<<< HEAD
/**
 * What the run is doing, from the parts of its assistant message. OMP's own
 * precedence: a running call's intent names the work, an unsealed reasoning
 * part reads as thinking, and anything else is the plain working line.
 */
export const createParsedStatus = (parts: readonly Part[]): ParsedStatusResult => {
    let activeCall: ToolCallPart | undefined;
    let reasoning = false;
    let text = false;
||||||| bc50ba56aa
/**
 * Tools that say what they do whether the model calls them directly or from a
 * Code Mode script: OpenChamber's own, the `opencode` namespace, and MCP
 * tools, which name the integration they come from.
 */
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

/**
 * The turn waits on a job OpenCode can move to the background: a shell command
 * or a subagent call that already runs. A pending call has not started yet (or
 * waits for a permission), and a background call settles at once, so neither
 * counts. A running Code Mode `execute` counts when a shell or subagent runs
 * inside it.
 */
export const hasBackgroundableWork = (parts: readonly Part[]): boolean => parts.some((part) => {
    if (part.type !== 'tool' || part.state?.status !== 'running') return false;
    if (isShellTool(part.tool) || isSubagentTool(part.tool)) return true;
    if (!isExecuteTool(part.tool)) return false;
    return executeHasBackgroundableWork(part.state.metadata);
});

/** `mcpServers`: the configured MCP server names, which name the integration an MCP tool comes from. */
export const createParsedStatus = (parts: Part[], genericKey: string, mcpServers: readonly string[] = [], waitingCalls?: ReadonlySet<string>): ParsedStatusResult => {
    const runningToolCounts = countRunningToolCalls(parts);
    let activePartType: ParsedStatusResult['activePartType'] = undefined;
    let activeToolName: string | undefined = undefined;
    let activeToolStatus: AgentStatus | undefined = undefined;
    let activeReasoningId: string | undefined = undefined;
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

export const hasBackgroundableWork = (parts: readonly Part[]): boolean => parts.some((part) => {
    if (part.type !== 'tool' || part.state?.status !== 'running') return false;
    if (isShellTool(part.tool) || isSubagentTool(part.tool)) return true;
    if (!isExecuteTool(part.tool)) return false;
    return executeHasBackgroundableWork(part.state.metadata);
});

export const createParsedStatus = (parts: Part[], genericKey: string, mcpServers: readonly string[] = [], waitingCalls?: ReadonlySet<string>): ParsedStatusResult => {
    const runningToolCounts = countRunningToolCalls(parts);
    let activePartType: ParsedStatusResult['activePartType'] = undefined;
    let activeToolName: string | undefined = undefined;
    let activeToolStatus: AgentStatus | undefined = undefined;
    let activeReasoningId: string | undefined = undefined;
>>>>>>> upstream/main

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

<<<<<<< HEAD
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
||||||| bc50ba56aa
    const isGenericStatus = activePartType === undefined;
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
    })();

    return { activePartType, activeToolName, status: resolved, isGenericStatus, canBackground: hasBackgroundableWork(parts) };
};

const encodeParsedStatus = (status: ParsedStatusResult): string => {
    return [
        status.activePartType ?? '',
        status.activeToolName ?? '',
        // The signature decides re-renders: equal statuses encode the same.
        JSON.stringify([status.status.key, status.status.count ?? null, status.status.name ?? null, status.status.seed ?? null]),
        status.isGenericStatus ? '1' : '0',
        status.canBackground ? '1' : '0',
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
    const [activePartType, activeToolName, encodedStatus, isGenericStatus, canBackground] = signature.split(STATUS_SIGNATURE_SEPARATOR);
    return {
        activePartType: activePartType === 'text' || activePartType === 'tool' || activePartType === 'reasoning' || activePartType === 'editing'
            ? activePartType
            : undefined,
        activeToolName: activeToolName || undefined,
        status: decodeStatus(encodedStatus),
        isGenericStatus: isGenericStatus === '1',
        canBackground: canBackground === '1',
    };
};

const isReasoningPart = (part: Part): part is ReasoningPart => part.type === 'reasoning';

const isTextPart = (part: Part): part is TextPart => part.type === 'text';

const getLegacyTextContent = (part: Part): string | undefined => {
    if (isTextPart(part)) {
        return part.text;
=======
    const isGenericStatus = activePartType === undefined;
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
    })();

    return { activePartType, activeToolName, status: resolved, isGenericStatus, canBackground: hasBackgroundableWork(parts) };
};

const encodeParsedStatus = (status: ParsedStatusResult): string => {
    return [
        status.activePartType ?? '',
        status.activeToolName ?? '',
        JSON.stringify([status.status.key, status.status.count ?? null, status.status.name ?? null, status.status.seed ?? null]),
        status.isGenericStatus ? '1' : '0',
        status.canBackground ? '1' : '0',
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
    const [activePartType, activeToolName, encodedStatus, isGenericStatus, canBackground] = signature.split(STATUS_SIGNATURE_SEPARATOR);
    return {
        activePartType: activePartType === 'text' || activePartType === 'tool' || activePartType === 'reasoning' || activePartType === 'editing'
            ? activePartType
            : undefined,
        activeToolName: activeToolName || undefined,
        status: decodeStatus(encodedStatus),
        isGenericStatus: isGenericStatus === '1',
        canBackground: canBackground === '1',
    };
};

const isReasoningPart = (part: Part): part is ReasoningPart => part.type === 'reasoning';

const isTextPart = (part: Part): part is TextPart => part.type === 'text';

const getLegacyTextContent = (part: Part): string | undefined => {
    if (isTextPart(part)) {
        return part.text;
>>>>>>> upstream/main
    }

    if (reasoning && !text) {
        return { status: { key: 'chat.agentStatus.thinking' }, isAnswering: false };
    }

    return { status: { key: 'chat.agentStatus.working' }, isAnswering: text };
};

<<<<<<< HEAD
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
||||||| bc50ba56aa
/**
 * Parallel calls are common (three reads, two shell commands), and the last
 * part alone hides the rest. Count every call that is still running or pending
 * by bucket so the phrase can say "reading 3 files" instead.
 */
const countRunningToolCalls = (parts: readonly Part[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const part of parts) {
        if (part.type !== 'tool') continue;
        const status = part.state?.status;
        if (status !== 'running' && status !== 'pending') continue;
        const toolName = getToolDisplayName(part);
        const bucket = TOOL_BUCKETS.get(toolName) ?? toolName;
        counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
=======
const countRunningToolCalls = (parts: readonly Part[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const part of parts) {
        if (part.type !== 'tool') continue;
        const status = part.state?.status;
        if (status !== 'running' && status !== 'pending') continue;
        const toolName = getToolDisplayName(part);
        const bucket = TOOL_BUCKETS.get(toolName) ?? toolName;
        counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
>>>>>>> upstream/main
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

<<<<<<< HEAD
/**
 * Canonical messages do not expose completion timestamps. A newer prompt may
 * follow either an active or finished assistant turn, so model attribution is
 * intentionally neutral until another assistant message arrives.
 */
export const getActiveAssistantContext = (messages: Message[], _sessionModel?: ModelRef | null): ActiveAssistantContext => {
    void _sessionModel;
||||||| bc50ba56aa
/**
 * `sessionModel` is the session record's own model: in OpenCode v2 a send
 * switches the session before the prompt goes out, so it names what the next
 * turn runs on before any assistant record exists.
 */
export const getActiveAssistantContext = (messages: Message[], sessionModel?: ModelRef | null): ActiveAssistantContext => {
    const sessionProviderId = sessionModel?.providerID.trim() ?? '';
    const sessionModelId = sessionModel?.id.trim() ?? '';
    const nextTurnModel = sessionProviderId && sessionModelId ? { providerId: sessionProviderId, modelId: sessionModelId } : null;
    // OpenCode v2 records the provider and model on the assistant message
    // itself, so the active model no longer has to be looked up on the user
    // message that triggered the turn (which no longer links back to it).
=======
export const getActiveAssistantContext = (messages: Message[], sessionModel?: ModelRef | null): ActiveAssistantContext => {
    const sessionProviderId = sessionModel?.providerID.trim() ?? '';
    const sessionModelId = sessionModel?.id.trim() ?? '';
    const nextTurnModel = sessionProviderId && sessionModelId ? { providerId: sessionProviderId, modelId: sessionModelId } : null;
>>>>>>> upstream/main
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message?.role !== 'assistant') continue;

<<<<<<< HEAD
        if (hasNewerPrompt(messages, index)) {
            return { assistantId: message.messageId, model: null };
||||||| bc50ba56aa
        // A prompt newer than this answer starts a turn this answer's model
        // says nothing about: a v2 user message carries no model, and the
        // composer may have switched models since. The session record already
        // holds the switched model (the send switches before it prompts), so it
        // is the one shown; without it nothing is shown rather than the previous
        // turn's. A turn still running keeps its model: the newer prompt is only
        // queued behind it.
        if (message.time.completed !== undefined && hasNewerPrompt(messages, index)) {
            return { assistantId: message.id, model: nextTurnModel };
=======
        if (message.time.completed !== undefined && hasNewerPrompt(messages, index)) {
            return { assistantId: message.id, model: nextTurnModel };
>>>>>>> upstream/main
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

<<<<<<< HEAD
||||||| bc50ba56aa
const ResetsAt = z.union([z.iso.datetime({ offset: true }).transform((value) => Date.parse(value)), z.number().positive()]);
const RateLimitBody = z.object({
    resets_at: ResetsAt.optional(),
    error: z.object({ resets_at: ResetsAt.optional() }).optional(),
});

/**
 * When a provider's rate limit lifts, from a `resets_at` field in the 429
 * body (top level or under `error`; an ISO date or epoch seconds/ms). OpenCode
 * caps a retry delay at 15 minutes, so a limit that lifts hours later shows
 * a retry that is bound to fail again; this time is the one that matters.
 * Only the body reaches the client: reset headers stay in OpenCode.
 */
export function limitResetsAt(error: StructuredError | undefined): number | undefined {
    const raw = error?.response?.body;
    if (!raw?.includes('resets_at')) return undefined;
    let json: unknown;
    try {
        json = JSON.parse(raw);
    } catch {
        return undefined;
    }
    const body = RateLimitBody.safeParse(json);
    if (!body.success) return undefined;
    const at = body.data.error?.resets_at ?? body.data.resets_at;
    if (at === undefined) return undefined;
    // Epoch seconds or milliseconds.
    return at < 1_000_000_000_000 ? at * 1000 : at;
}

=======
const ResetsAt = z.union([z.iso.datetime({ offset: true }).transform((value) => Date.parse(value)), z.number().positive()]);
const RateLimitBody = z.object({
    resets_at: ResetsAt.optional(),
    error: z.object({ resets_at: ResetsAt.optional() }).optional(),
});

export function limitResetsAt(error: StructuredError | undefined): number | undefined {
    const raw = error?.response?.body;
    if (!raw?.includes('resets_at')) return undefined;
    let json: unknown;
    try {
        json = JSON.parse(raw);
    } catch {
        return undefined;
    }
    const body = RateLimitBody.safeParse(json);
    if (!body.success) return undefined;
    const at = body.data.error?.resets_at ?? body.data.resets_at;
    if (at === undefined) return undefined;
    return at < 1_000_000_000_000 ? at * 1000 : at;
}

>>>>>>> upstream/main
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

<<<<<<< HEAD
    const lastAssistantSignature = useDirectorySync(
||||||| bc50ba56aa
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
=======
    const mcpServerConfigs = useMcpConfigStore((state) => selectMcpServersForDirectory(state, currentSessionDirectory));
    const loadMcpConfigs = useMcpConfigStore((state) => state.loadMcpConfigs);
    React.useEffect(() => {
        void loadMcpConfigs({ directory: currentSessionDirectory });
    }, [currentSessionDirectory, loadMcpConfigs]);
    const mcpServers = React.useMemo(() => mcpServerConfigs.map((server) => server.name), [mcpServerConfigs]);

    const waitingCallIds = useGlobalBlockingRequestsStore(React.useCallback(
        (state) => (currentSessionId ? state.bySession.get(currentSessionId)?.pages.map((page) => page.id).join('\n') ?? '' : ''),
        [currentSessionId],
    ));
    const waitingCalls = React.useMemo(() => new Set(waitingCallIds ? waitingCallIds.split('\n') : []), [waitingCallIds]);
    const lastAssistantStatusSignature = useDirectorySync(
>>>>>>> upstream/main
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
    // external: #5391 a form whose tool call has ended leaves the turn running.
    const releasedForms = useRecoverableQuestionsStore((state) => state.releasedForms);
    const formHoldsTurn = useDirectorySync(
        React.useCallback((state) => (
            state.form[currentSessionId ?? '']?.some((form) => formTurnHold(form, state.part, releasedForms) !== 'released') ?? false
        ), [currentSessionId, releasedForms]),
        currentSessionDirectory ?? undefined,
    );

    const sessionAbortRecord = useSessionUIStore(
        React.useCallback((state) => {
            if (!currentSessionId) {
                return null;
            }
            return state.sessionAbortFlags?.get(currentSessionId) ?? null;
        }, [currentSessionId])
    );

<<<<<<< HEAD
    const { isWorking: isPhaseWorking } = useSessionActivity(currentSessionId, currentSessionDirectory ?? undefined);
    const isCompacting = useSessionCompacting(currentSessionId, currentSessionDirectory ?? undefined) !== null;
||||||| bc50ba56aa
    const { phase: activityPhase, isWorking: isPhaseWorking } = useSessionActivity(currentSessionId, currentSessionDirectory ?? undefined);

    const currentSessionStatus = useSessionStatus(currentSessionId ?? '', currentSessionDirectory ?? undefined);

    const sessionRetryAttempt = currentSessionStatus?.type === 'retry'
        ? (currentSessionStatus as { type: 'retry'; attempt?: number }).attempt
        : undefined;

    const sessionRetryNext = currentSessionStatus?.type === 'retry'
        ? (currentSessionStatus as { type: 'retry'; next?: number }).next
        : undefined;

    // OpenCode 2.x reports a scheduled retry on the assistant message it will
    // retry, not as a session status; the next attempt's step start clears it.
    const assistantRetry = React.useMemo(() => {
        if (!lastAssistantId) return null;
        const message = rawSessionMessages.find((candidate) => candidate.id === lastAssistantId);
        return message?.role === 'assistant' ? message.retry ?? null : null;
    }, [rawSessionMessages, lastAssistantId]);
=======
    const { phase: activityPhase, isWorking: isPhaseWorking } = useSessionActivity(currentSessionId, currentSessionDirectory ?? undefined);

    const currentSessionStatus = useSessionStatus(currentSessionId ?? '', currentSessionDirectory ?? undefined);

    const sessionRetryAttempt = currentSessionStatus?.type === 'retry'
        ? (currentSessionStatus as { type: 'retry'; attempt?: number }).attempt
        : undefined;

    const sessionRetryNext = currentSessionStatus?.type === 'retry'
        ? (currentSessionStatus as { type: 'retry'; next?: number }).next
        : undefined;

    const assistantRetry = React.useMemo(() => {
        if (!lastAssistantId) return null;
        const message = rawSessionMessages.find((candidate) => candidate.id === lastAssistantId);
        return message?.role === 'assistant' ? message.retry ?? null : null;
    }, [rawSessionMessages, lastAssistantId]);
>>>>>>> upstream/main

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
