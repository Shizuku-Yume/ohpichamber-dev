import type { JsonObject, JsonValue } from '@openchamber/agent-contract';
import { z } from 'zod';

import type { ToolPresentation } from './types';
import { evalResultSummary } from './toolView';
import { parseEditInputPaths } from './editInputPaths';
import { normalizeIntent } from './intent';
import {
    detailNumber,
    detailText,
    detailValue,
    inputText,
    jsonSummary,
    plainTool,
    queryTool,
    searchResultSummary,
    text,
    tt,
} from './helpers';
import { STRUCTURED_TOOL_PRESENTATIONS } from './structuredPresentations';
import { VIBE_TOOL_PRESENTATIONS } from './vibePresentations';
const diffStats = (diff: string): string | null => {
    let added = 0;
    let removed = 0;
    for (const line of diff.split('\n')) {
        if (line.startsWith('+++') || line.startsWith('---')) continue;
        if (line.startsWith('+')) added += 1;
        else if (line.startsWith('-')) removed += 1;
    }
    return added || removed ? `+${added}/-${removed}` : null;
};

const editCallDescription: ToolPresentation['describeCall'] = (input) => {
    const direct = inputText(input, 'path', 'file_path');
    if (direct) return direct;
    const program = z.string().safeParse(input.input).data;
    if (program === undefined) return null;
    const paths = parseEditInputPaths(program);
    if (paths.length === 0) return null;
    return paths.length === 1 ? text(paths[0]) : text(`${paths[0]} (+${paths.length - 1})`);
};

const editSummary: ToolPresentation['describeResult'] = (result) =>
    diffStats(detailText(result, 'diff') ?? '') ?? detailText(result, 'message');

const todoSummary: ToolPresentation['describeResult'] = (result) => {
    const phases = detailValue(result, 'phases');
    const parsed = z.array(z.object({ tasks: z.array(z.object({ status: z.string() })) })).safeParse(phases);
    if (!parsed.success) return null;
    const tasks = parsed.data.flatMap((phase) => phase.tasks);
    const done = tasks.filter((task) => task.status === 'completed' || task.status === 'abandoned').length;
    return tasks.length > 0 ? `${done}/${tasks.length}` : null;
};

const askSummary: ToolPresentation['describeResult'] = (result) => {
    const timedOut = detailValue(result, 'timedOut') === true;
    const answers = z.array(z.object({ answer: z.string().optional() })).safeParse(detailValue(result, 'answers')).data;
    if (answers && answers.length > 0) {
        const answered = answers.filter((item) => Boolean(item.answer?.trim())).length;
        return timedOut ? `timed out · ${answered}/${answers.length} answered` : `${answered}/${answers.length} answered`;
    }
    const rawData = z.record(z.string(), z.json()).safeParse(detailValue(result, 'data')).data;
    if (rawData) {
        const entries = Object.entries(rawData);
        if (entries.length > 0) {
            const answered = entries.filter(([, value]) => {
                if (value === null || value === undefined) return false;
                const stringValue = z.string().safeParse(value).data;
                if (stringValue !== undefined) return stringValue.trim().length > 0;
                if (Array.isArray(value)) return value.length > 0;
                return true;
            }).length;
            return timedOut ? `timed out · ${answered}/${entries.length} answered` : `${answered}/${entries.length} answered`;
        }
        if (timedOut) return 'timed out';
    }
    const results = detailValue(result, 'results');
    const multi = z.array(z.object({
        selectedOptions: z.array(z.string()).optional(),
        customInput: z.string().optional(),
        timedOut: z.boolean().optional(),
    })).safeParse(results).data;
    if (multi && multi.length > 0) {
        const answered = multi.filter((item) => (item.selectedOptions?.length ?? 0) > 0 || item.customInput || item.timedOut).length;
        return `${answered}/${multi.length} answered`;
    }
    if (detailValue(result, 'chatRedirect') === true) return 'sent to chat';
    if (timedOut) return 'timed out';
    const selected = z.array(z.string()).safeParse(detailValue(result, 'selectedOptions')).data;
    return selected?.length ? text(selected.join(', ')) : detailText(result, 'customInput');
};

const taskItemCallSchema = z.object({
    name: z.string().optional(),
    agent: z.string().optional(),
    task: z.string().optional(),
});

const taskStepsSchema = z.array(z.string());

const taskCallDescription = (input: JsonObject): string | null => {
    const rawIntent = z.string().safeParse(input.i).data;
    if (rawIntent) {
        const intent = normalizeIntent(rawIntent);
        if (intent) return text(intent);
    }
    const batchTasks = z.array(taskItemCallSchema).safeParse(input.tasks).data;
    if (batchTasks && batchTasks.length > 0) {
        if (batchTasks.length === 1) {
            const item = batchTasks[0];
            const itemName = text(item?.name);
            if (itemName) return itemName;
            const itemRole = text(item?.agent);
            if (itemRole) return text(`1 subagent (${itemRole})`);
            return text(item?.task) ?? inputText(input, 'context') ?? '1 subagent';
        }
        const roles: string[] = [];
        for (const item of batchTasks) {
            const role = item.agent?.trim();
            if (role && !roles.includes(role)) roles.push(role);
        }
        if (roles.length > 0) {
            return text(`${batchTasks.length} subagents (${roles.join(', ')})`);
        }
        const names: string[] = [];
        for (const item of batchTasks) {
            const name = text(item.name, 40);
            if (name && !names.includes(name)) names.push(name);
        }
        return names.length > 0
            ? text(`${batchTasks.length} subagents (${names.join(', ')})`)
            : `${batchTasks.length} subagents`;
    }
    const singleName = inputText(input, 'name');
    if (singleName) return singleName;
    const singleTask = inputText(input, 'task');
    if (singleTask) return singleTask;
    const steps = taskStepsSchema.safeParse(input.steps).data;
    if (steps?.length) {
        const firstStep = text(steps[0]);
        if (firstStep) return firstStep;
    }
    const singleRole = inputText(input, 'agent');
    if (singleRole) return text(`1 subagent (${singleRole})`);
    return inputText(input, 'context');
};

const taskProgressItemSchema = z.object({
    id: z.string().optional(),
    status: z.string().optional(),
});
const taskAsyncSchema = z.object({
    state: z.string().optional(),
    jobId: z.string().optional(),
});

export interface TaskSubagentStatusEntry {
    id: string;
    childSessionId?: string;
    name?: string;
    status: string;
}

type NormalizedTaskState = 'running' | 'failed' | 'cancelled' | 'completed';

const normalizeTaskStatus = (status: string | undefined): NormalizedTaskState | null => {
    const normalized = status?.trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === 'running' || normalized === 'idle' || normalized === 'pending') return 'running';
    if (normalized === 'failed' || normalized.startsWith('failed')) return 'failed';
    if (normalized === 'cancelled' || normalized === 'aborted') return 'cancelled';
    if (normalized === 'completed' || normalized === 'parked') return 'completed';
    return null;
};

const taskSummary: ToolPresentation['describeResult'] = (result) => {
    const results = z.array(z.unknown()).safeParse(detailValue(result, 'results')).data;
    const progress = z.array(taskProgressItemSchema).safeParse(detailValue(result, 'progress')).data;
    const asyncInfo = taskAsyncSchema.safeParse(detailValue(result, 'async')).data;
    const count = Math.max(progress?.length ?? 0, results?.length ?? 0);
    const countLabel = count > 0 ? `${count} ${count === 1 ? 'subagent' : 'subagents'}` : null;
    const asyncState = asyncInfo?.state?.trim();
    if (asyncState === 'running' || asyncState === 'failed' || asyncState === 'completed' || asyncState === 'cancelled') {
        return countLabel ? `${countLabel} · ${asyncState}` : asyncState;
    }
    if (progress && progress.length > 0 && (!results || results.length === 0)) {
        const hasRunning = progress.some((item) => item.status === 'running' || item.status === 'pending');
        const hasFailed = progress.some((item) => item.status === 'failed');
        if (hasRunning) return `${countLabel} · running`;
        if (hasFailed) return `${countLabel} · failed`;
    }
    return countLabel;
};

export const describeTaskResultWithSubagents = (
    details: JsonValue | undefined,
    subagents: readonly TaskSubagentStatusEntry[],
    reportStatuses?: ReadonlyMap<string, string>,
    expectedIds?: readonly string[],
): string | null => {
    const results = z.array(z.unknown()).safeParse(detailValue(details, 'results')).data;
    const progress = z.array(taskProgressItemSchema).safeParse(detailValue(details, 'progress')).data ?? [];
    const asyncInfo = taskAsyncSchema.safeParse(detailValue(details, 'async')).data;

    if (results && results.length > 0 && !asyncInfo) {
        return taskSummary(details);
    }

    const resolvedStatuses: Array<NormalizedTaskState | null> = [];
    if (subagents.length > 0) {
        const storeMatched = new Set<string>();
        for (const entry of subagents) {
            resolvedStatuses.push(normalizeTaskStatus(entry.status));
            if (entry.id) storeMatched.add(entry.id);
            if (entry.childSessionId) storeMatched.add(entry.childSessionId);
            if (entry.name) storeMatched.add(entry.name);
        }
        if (subagents.length < progress.length) {
            for (const item of progress) {
                if (item.id && storeMatched.has(item.id)) continue;
                const reportStatus = item.id ? reportStatuses?.get(item.id) : undefined;
                resolvedStatuses.push(normalizeTaskStatus(reportStatus ?? item.status) ?? 'running');
            }
        }
    } else if (reportStatuses && reportStatuses.size > 0) {
        const progressIds = progress
            .map((item) => item.id?.trim())
            .filter((id): id is string => Boolean(id));
        const candidateIds = progressIds.length > 0
            ? progressIds
            : (expectedIds && expectedIds.length > 0
                ? expectedIds
                : (asyncInfo?.jobId?.trim() ? [asyncInfo.jobId.trim()] : []));
        if (candidateIds.some((id) => reportStatuses.has(id))) {
            const progressById = new Map<string, string | undefined>();
            for (const item of progress) {
                if (item.id) progressById.set(item.id.trim(), item.status);
            }
            for (const id of candidateIds) {
                const reportStatus = reportStatuses.get(id);
                resolvedStatuses.push(normalizeTaskStatus(reportStatus ?? progressById.get(id)) ?? 'running');
            }
        }
    }

    if (resolvedStatuses.length === 0) {
        return taskSummary(details);
    }

    const count = Math.max(resolvedStatuses.length, progress.length, results?.length ?? 0);
    const countLabel = count > 0 ? `${count} ${count === 1 ? 'subagent' : 'subagents'}` : null;
    let aggregate: NormalizedTaskState | null = null;
    if (resolvedStatuses.some((status) => status === 'running')) aggregate = 'running';
    else if (resolvedStatuses.some((status) => status === 'failed')) aggregate = 'failed';
    else if (resolvedStatuses.some((status) => status === 'cancelled')) aggregate = 'cancelled';
    else if (resolvedStatuses.every((status) => status === 'completed')) aggregate = 'completed';

    if (!aggregate) {
        return taskSummary(details);
    }
    return countLabel ? `${countLabel} · ${aggregate}` : aggregate;
};

const waitJobSchema = z.object({ status: z.string().optional() });

const waitSummary: ToolPresentation['describeResult'] = (result) => {
    const jobs = z.array(waitJobSchema).safeParse(detailValue(result, 'jobs')).data;
    const agents = z.array(z.unknown()).safeParse(detailValue(result, 'agents')).data;
    const interrupted = detailValue(result, 'interrupted') === true;
    const parts: string[] = [];
    if (jobs && jobs.length > 0) {
        const runningCount = jobs.filter((job) => job.status === 'running').length;
        parts.push(
            runningCount > 0 && runningCount < jobs.length
                ? `${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'} (${runningCount} running)`
                : `${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'}`,
        );
    }
    if (agents && agents.length > 0) {
        parts.push(`${agents.length} ${agents.length === 1 ? 'subagent' : 'subagents'}`);
    }
    if (parts.length === 0 && interrupted) {
        return 'interrupted';
    }
    return parts.length ? parts.join(' · ') : null;
};

const bashAsyncSchema = z.object({
    jobId: z.string().min(1),
    state: z.string().min(1),
});

const bashServiceSchema = z.object({
    name: z.string().min(1),
    state: z.string().optional(),
    ready: z.boolean().optional(),
    timedOut: z.boolean().optional(),
    pid: z.number().optional(),
});

const bashSummary: ToolPresentation['describeResult'] = (result) => {
    const parts: string[] = [];
    const asyncInfo = bashAsyncSchema.safeParse(detailValue(result, 'async')).data;
    if (asyncInfo) {
        parts.push(`job ${asyncInfo.jobId} · ${asyncInfo.state}`);
    }
    const serviceInfo = bashServiceSchema.safeParse(detailValue(result, 'service')).data;
    if (serviceInfo) {
        const readyText = serviceInfo.ready === true
            ? 'ready'
            : serviceInfo.timedOut === true
                ? 'ready timed out'
                : serviceInfo.ready === false
                    ? 'not ready'
                    : serviceInfo.state;
        const serviceParts = [
            `service ${serviceInfo.name}`,
            readyText,
            serviceInfo.pid !== undefined ? `pid ${serviceInfo.pid}` : null,
        ].filter(Boolean);
        parts.push(serviceParts.join(' · '));
    }
    const exitCode = detailNumber(result, 'exitCode');
    if (exitCode !== null) {
        parts.push(exitCode === 0 ? 'exit 0' : `exit ${exitCode}`);
    } else if (detailValue(result, 'timedOut') === true) {
        parts.push('timed out');
    }
    return parts.length > 0 ? parts.join(' · ') : null;
};

const mcpDetailsSchema = z.object({
    serverName: z.string().trim().min(1),
    mcpToolName: z.string().trim().min(1),
});

const mcpProgressSchema = z.object({
    progress: z.object({
        progress: z.number(),
        total: z.number().optional(),
        message: z.string().optional(),
    }).optional(),
});

const formatMcpToolLabel = (toolName: string, details?: JsonValue): string | null => {
    const parsedDetails = mcpDetailsSchema.safeParse(details).data;
    if (parsedDetails) {
        return `${parsedDetails.serverName}: ${parsedDetails.mcpToolName}`;
    }
    if (!toolName.startsWith('mcp__')) return null;
    const rest = toolName.slice('mcp__'.length);
    if (!rest) return null;
    const doubleIdx = rest.indexOf('__');
    if (doubleIdx > 0 && doubleIdx < rest.length - 2) {
        return `${rest.slice(0, doubleIdx)}: ${rest.slice(doubleIdx + 2)}`;
    }
    const singleIdx = rest.indexOf('_');
    if (singleIdx > 0 && singleIdx < rest.length - 1) {
        return `${rest.slice(0, singleIdx)}: ${rest.slice(singleIdx + 1)}`;
    }
    return rest;
};
const hostCall: ToolPresentation['describeCall'] = (input) => {
    const action = z.object({ action: z.string().optional(), input: z.record(z.string(), z.unknown()).optional() }).safeParse(input).data;
    if (!action?.action) return null;
    const salient = action.input ? Object.values(action.input).flatMap((item) => {
        const stringItem = z.string().safeParse(item).data;
        return stringItem === undefined ? [] : [stringItem];
    })[0] : undefined;
    return salient !== undefined && salient.trim() ? `${action.action}: ${salient.trim().slice(0, 120)}` : action.action;
};

const readPresentation: ToolPresentation = {
    label: 'Read', icon: 'file-text', group: 'read', outputLanguage: 'auto',
    describeCall: (input) => inputText(input, 'path', 'file_path'),
    describeResult: (result) => {
        const totalLines = detailNumber(result, 'totalLines');
        const truncation = detailText(result, 'truncation');
        return totalLines !== null ? `${totalLines} lines${truncation ? ` · ${truncation}` : ''}` : null;
    },
};

const bashPresentation: ToolPresentation = {
    label: 'Bash', icon: 'terminal-box', group: 'call', outputLanguage: 'text',
    describeCall: (input) => inputText(input, 'command'),
    describeResult: bashSummary,
};

export const TOOL_PRESENTATIONS = {
    read: readPresentation,
    bash: bashPresentation,
    edit: {
        label: 'Edit', icon: 'pencil', group: 'call', outputLanguage: 'diff',
        describeCall: editCallDescription,
        describeResult: editSummary,
    },
    apply_patch: {
        label: 'Edit', icon: 'pencil', group: 'call', outputLanguage: 'diff',
        describeCall: editCallDescription,
        describeResult: editSummary,
    },
    ast_grep: {
        label: 'AST Grep', icon: 'code-box', group: 'search', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'pat', 'pattern'),
        describeResult: searchResultSummary,
    },
    ast_edit: {
        label: 'AST Edit', icon: 'code-box', group: 'call', outputLanguage: 'diff',
        describeCall: (input) => {
            const ops = z.array(z.object({ pat: z.string(), out: z.string() })).safeParse(input.ops).data;
            return ops?.[0] ? text(`${ops[0].pat} → ${ops[0].out}`) : inputText(input, 'path', 'paths');
        },
        describeResult: searchResultSummary,
    },
    ask: {
        label: 'Ask', icon: 'survey', group: 'call', outputLanguage: 'text',
        describeCall: (input) => {
            const questions = z.array(z.object({ question: z.string() })).safeParse(input.questions).data;
            if (questions?.length === 1) return text(questions[0].question);
            if (questions && questions.length > 1) return `${questions.length} questions`;
            return inputText(input, 'question');
        },
        describeResult: askSummary,
    },
    ...STRUCTURED_TOOL_PRESENTATIONS,
    ...VIBE_TOOL_PRESENTATIONS,
    ida: plainTool('IDA', 'bug', ['action', 'target']),
    eval: {
        label: 'Eval', icon: 'code', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'title', 'language', 'code'),
        describeResult: evalResultSummary,
    },
    glob: {
        label: 'Glob', icon: 'file-search', group: 'search', outputLanguage: 'text',
        describeCall: (input) => {
            const pattern = inputText(input, 'pattern');
            const path = inputText(input, 'path');
            if (pattern && path && pattern !== path) {
                return text(tt('chat.toolPart.summary.patternInPath', { pattern, path }));
            }
            return pattern ?? path;
        },
        describeResult: searchResultSummary,
    },
    grep: queryTool('Grep', 'menu-search', ['pattern']),
    search: queryTool('Grep', 'menu-search', ['pattern']),
    find: queryTool('Find', 'compass-3', ['query']),
    lsp: {
        label: 'LSP', icon: 'code', group: 'call', outputLanguage: 'text',
        describeCall: (input) => {
            const action = inputText(input, 'action');
            const target = inputText(input, 'file', 'symbol');
            return [action, target].filter(Boolean).join(' ') || null;
        },
        describeResult: (result) => detailText(result, 'serverName'),
    },
    task: {
        label: 'Task', icon: 'ai-agent', group: 'call', outputLanguage: 'text',
        describeCall: taskCallDescription,
        describeResult: taskSummary,
    },
    wait: {
        label: 'Wait', icon: 'time', group: 'call', outputLanguage: 'text',
        describeCall: (input) => {
            const rawIntent = z.string().safeParse(input.i).data;
            if (rawIntent) {
                const intent = normalizeIntent(rawIntent);
                if (intent) return text(intent);
            }
            return inputText(input, 'op');
        },
        describeResult: waitSummary,
    },
    todo: {
        label: 'Todo', icon: 'list-check-2', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'task', 'phase', 'op'),
        describeResult: todoSummary,
    },
    web_search: {
        label: 'Web search', icon: 'global', group: 'search', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'query'),
        describeResult: (result) => detailText(result, 'error') ? 'failed' : null,
    },
    write: {
        label: 'Write', icon: 'file-edit', group: 'call', outputLanguage: 'auto',
        describeCall: (input) => inputText(input, 'path', 'file_path'),
        describeResult: (result) => detailText(result, 'message'),
    },
    tts: {
        label: 'Speech generation', icon: 'volume-up', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'output_path', 'text'),
        describeResult: (result) => {
            const codec = detailText(result, 'codec')?.toUpperCase();
            const voiceId = detailText(result, 'voiceId');
            const bytes = detailNumber(result, 'bytes');
            const parts = [codec, voiceId, bytes !== null ? `${bytes} bytes` : null].filter(Boolean);
            return parts.length > 0 ? parts.join(' · ') : null;
        },
    },
    memory_edit: {
        label: 'Memory edit', icon: 'brain-4', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'op', 'id'),
        describeResult: (result) => detailText(result, 'status') ?? detailText(result, 'message'),
    },
    retain: {
        label: 'Retain', icon: 'brain-4', group: 'call', outputLanguage: 'text',
        describeCall: (input) => Array.isArray(input.items) ? `${input.items.length} items` : null,
        describeResult: (result) => detailNumber(result, 'count') !== null ? `${detailNumber(result, 'count')} saved` : null,
    },
    recall: {
        label: 'Recall', icon: 'brain-4', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'query'),
        describeResult: (result) => detailNumber(result, 'count') !== null ? `${detailNumber(result, 'count')} memories` : detailText(result, 'status'),
    },
    reflect: queryTool('Reflect', 'brain-4', ['query'], 'call'),
    learn: {
        label: 'Learn', icon: 'lightbulb', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'memory'),
        describeResult: (result) => detailText(result, 'message') ?? 'lesson saved',
    },
    manage_skill: {
        label: 'Manage skill', icon: 'book-open', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'action', 'name'),
        describeResult: (result) => detailText(result, 'name'),
    },
    openchamber: {
        label: 'OhPiChamber', icon: 'openchamber', group: 'call', outputLanguage: 'text',
        describeCall: hostCall,
        describeResult: jsonSummary,
    },
    openchamber_knowledge: {
        label: 'Project knowledge', icon: 'book-open', group: 'call', outputLanguage: 'text',
        describeCall: hostCall,
        describeResult: jsonSummary,
    },
    web: {
        label: 'Browser', icon: 'global', group: 'call', outputLanguage: 'text',
        describeCall: hostCall,
        describeResult: jsonSummary,
    },
    notify: {
        label: 'Notify', icon: 'notification-3', group: 'call', outputLanguage: 'text',
        describeCall: hostCall,
        describeResult: jsonSummary,
    },
    openchamber_workflow: {
        label: 'Workflow', icon: 'flow-chart', group: 'call', outputLanguage: 'text',
        describeCall: hostCall,
        describeResult: jsonSummary,
    },
    openchamber_render: {
        label: 'Render', icon: 'layout', group: 'call', outputLanguage: 'text',
        describeCall: hostCall,
        describeResult: jsonSummary,
    },
    openchamber_usage: {
        label: 'Usage', icon: 'bar-chart', group: 'call', outputLanguage: 'text',
        describeCall: hostCall,
        describeResult: jsonSummary,
    },
    reasoning: {
        label: 'Reasoning', icon: 'brain-ai-3', group: 'call', outputLanguage: 'text',
        describeCall: () => null, describeResult: () => null,
    },
    'image-preview': {
        label: 'Image', icon: 'file-image', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'path'), describeResult: () => null,
    },
    'mermaid-preview': {
        label: 'Diagram', icon: 'file-list-2', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'path'), describeResult: () => null,
    },
    skill: {
        label: 'Skill', icon: 'book-open', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'name', 'path'), describeResult: () => null,
    },
} satisfies Record<string, ToolPresentation>;

export type KnownToolName = keyof typeof TOOL_PRESENTATIONS;

/** OMP's model-facing tools plus hidden ones, aliases, vibes, advise and the fork's host tools. */
export const KNOWN_TOOL_NAMES = Object.keys(TOOL_PRESENTATIONS) as KnownToolName[];

/** The generic row for an extension, MCP or plugin tool the registry has never seen. */
export const fallbackPresentation = (toolName: string, details?: JsonValue): ToolPresentation => ({
    label: formatMcpToolLabel(toolName, details) ?? (toolName || 'Tool'),
    icon: 'tools',
    group: 'call',
    outputLanguage: 'text',
    describeCall: () => null,
    describeResult: (detailsValue) => {
        const progress = mcpProgressSchema.safeParse(detailsValue).data?.progress;
        if (!progress) return null;
        const amount = progress.total !== undefined ? `${progress.progress}/${progress.total}` : `${progress.progress}`;
        const message = progress.message?.trim();
        return message ? text(`${message} (${amount})`) : amount;
    },
});
