import { modelRefKey, type JsonObject, type JsonValue } from '@openchamber/agent-contract';
import { z } from 'zod';

import type { ToolGroup, ToolPresentation } from './types';
import { evalResultSummary } from './toolView';
import { parseEditInputPaths } from './editInputPaths';
import { normalizeIntent } from './intent';
import { formatMessage, useI18nStore, type I18nKey, type I18nParams } from '@/lib/i18n/store';

const tt = (key: I18nKey, params?: I18nParams): string =>
    formatMessage(useI18nStore.getState().dictionary, key, params);

/** A JSON field's non-blank text. */
const text = (value: JsonValue | undefined, max = 160): string | null => {
    const parsed = z.string().safeParse(value).data?.trim();
    if (!parsed) return null;
    const line = parsed.split('\n')[0]?.trim() ?? '';
    return line ? line.slice(0, max) : null;
};

/** The first present field of a call's input, as a short row description. */
const inputText = (input: JsonObject, ...keys: readonly string[]): string | null => {
    for (const key of keys) {
        const value = text(input[key]);
        if (value) return value;
    }
    return null;
};

const detailValue = (value: JsonValue | undefined, key: string): JsonValue | undefined =>
    z.record(z.string(), z.json()).safeParse(value).data?.[key];

const detailNumber = (value: JsonValue | undefined, key: string): number | null =>
    z.number().safeParse(detailValue(value, key)).data ?? null;

const detailText = (value: JsonValue | undefined, key: string): string | null => text(detailValue(value, key));


/** `3 matches · 2 files`, or whichever of the two the result reported. */
const counted = (value: JsonValue | undefined, amountKey: string, fileKey: string): string | null => {
    const amount = detailNumber(value, amountKey);
    const files = detailNumber(value, fileKey);
    if (amount === null && files === null) return null;
    const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;
    return [amount !== null ? plural(amount, 'match', 'matches') : null, files !== null ? plural(files, 'file', 'files') : null]
        .filter(Boolean).join(' · ');
};

/**
 * A search row's summary, in OMP's own header terms: `N matches · M files` for
 * a pattern search, `N files` for a listing, `N hits` for a relevance search.
 * Falls back to the reported item count when the result carries no totals.
 */
const searchResultSummary = (value: JsonValue | undefined): string | null => {
    const matches = counted(value, 'matchCount', 'fileCount');
    if (matches) return matches;
    const files = detailNumber(value, 'fileCount');
    if (files !== null) return `${files} ${files === 1 ? 'file' : 'files'}`;
    const hits = z.array(z.unknown()).safeParse(detailValue(value, 'hits')).data?.length;
    if (hits !== undefined) return `${hits} ${hits === 1 ? 'hit' : 'hits'}`;
    return counted(value, 'totalReplacements', 'filesTouched');
};

/** Added and removed line counts from a unified diff, as `+3/-1`. */
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

const jsonSummary: ToolPresentation['describeResult'] = (result) => {
    const root = z.record(z.string(), z.json()).safeParse(result).data;
    if (!root) return null;
    const keys = Object.keys(root);
    return keys.length > 0 ? `${keys.length} fields` : null;
};

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

export const vibeScreenSnapshotSchema = z.object({
    id: z.string(),
    cli: z.string(),
    state: z.string(),
    killed: z.boolean().optional(),
    model: z.string().optional(),
    turns: z.number(),
    queued: z.number(),
    turnStartedAt: z.number().optional(),
    turnMessage: z.string().optional(),
    currentTool: z.string().optional(),
    currentToolArgs: z.string().optional(),
    lastIntent: z.string().optional(),
    trace: z.array(z.string()).default([]),
    outputTail: z.array(z.string()).default([]),
    lastActivity: z.string().optional(),
    lastActivityAt: z.number().optional(),
});

export const vibeToolDetailsSchema = z.object({
    op: z.enum(['spawn', 'send', 'wait', 'kill', 'list']).optional(),
    screens: z.array(vibeScreenSnapshotSchema).default([]),
    hiddenKilled: z.array(z.string()).optional(),
    spawned: z.object({
        id: z.string(),
        cli: z.string(),
        jobId: z.string(),
    }).optional(),
    send: z.object({
        id: z.string(),
        mode: z.enum(['turn', 'steered', 'queued']),
        jobId: z.string().optional(),
    }).optional(),
    wait: z.object({
        settled: z.array(z.object({
            id: z.string(),
            jobId: z.string(),
            status: z.enum(['completed', 'failed', 'cancelled']),
        })),
        stillRunning: z.array(z.string()),
        timedOut: z.boolean(),
        waiting: z.boolean().optional(),
    }).optional(),
    killed: z.object({
        id: z.string(),
        cancelledTurn: z.boolean(),
    }).optional(),
});

export type VibeToolDetails = z.infer<typeof vibeToolDetailsSchema>;
export type VibeScreenSnapshot = z.infer<typeof vibeScreenSnapshotSchema>;

const yieldTypeSchema = z.union([z.string(), z.array(z.string())]);
const yieldDetailsSchema = z.object({
    status: z.string().optional(),
    type: yieldTypeSchema.optional(),
    error: z.string().optional(),
});

const thinkDetailsSchema = z.object({
    recorded: z.boolean().optional(),
});

const newContextDetailsSchema = z.object({
    requested: z.boolean().optional(),
});

const imageGenDetailsSchema = z.object({
    provider: z.string().optional(),
    model: z.string().optional(),
    imageCount: z.number().optional(),
    imagePaths: z.array(z.string()).optional(),
});

const debugDetailsSchema = z.object({
    action: z.string().optional(),
    success: z.boolean().optional(),
    snapshot: z.object({
        status: z.string().optional(),
        stopReason: z.string().optional(),
    }).optional(),
});

const githubDetailsSchema = z.object({
    status: z.string().optional(),
    conclusion: z.string().optional(),
    failedJobs: z.array(z.string()).optional(),
});

const goalDetailsSchema = z.object({
    op: z.string().optional(),
    goal: z.object({
        status: z.string().optional(),
        objective: z.string().optional(),
    }).nullable().optional(),
});

const securityScanDetailsSchema = z.object({
    action: z.string().optional(),
    cancelled: z.boolean().optional(),
    operation: z.object({
        status: z.string().optional(),
    }).optional(),
    finding: z.object({
        validationStatus: z.string().optional(),
    }).optional(),
    importedScan: z.object({
        findingCount: z.number().optional(),
    }).optional(),
});

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

const formatYieldType = (value: string | string[] | undefined): string | null => {
    const single = z.string().safeParse(value).data;
    if (single !== undefined) return text(single);
    if (Array.isArray(value)) {
        const joined = value.map((entry) => entry.trim()).filter(Boolean).join(', ');
        return joined ? text(joined) : null;
    }
    return null;
};

export const formatMcpToolLabel = (toolName: string, details?: JsonValue): string | null => {
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

/** A tool whose call row shows a free-form query, summarized by what it found. */
const queryTool = (label: string, icon: ToolPresentation['icon'], keys: readonly string[], group: ToolGroup = 'search'): ToolPresentation => ({
    label, icon, group, outputLanguage: 'text',
    describeCall: (input) => inputText(input, ...keys),
    describeResult: group === 'search' ? searchResultSummary : jsonSummary,
});

/** A tool whose results are code or JSON with no dedicated summary. */
const plainTool = (label: string, icon: ToolPresentation['icon'], keys: readonly string[] = ['action'], group: ToolGroup = 'call'): ToolPresentation => ({
    label, icon, group, outputLanguage: 'text',
    describeCall: (input) => inputText(input, ...keys),
    describeResult: () => null,
});

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
    debug: {
        label: 'Debug', icon: 'bug', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'action', 'program', 'file', 'expression'),
        describeResult: (result) => {
            const snapshot = debugDetailsSchema.safeParse(result).data?.snapshot;
            if (!snapshot) return null;
            const parts = [text(snapshot.status), text(snapshot.stopReason)].filter(Boolean);
            return parts.length > 0 ? parts.join(' · ') : null;
        },
    },
    ida: plainTool('IDA', 'bug', ['action', 'target']),
    eval: {
        label: 'Eval', icon: 'code', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'title', 'language', 'code'),
        describeResult: evalResultSummary,
    },
    github: {
        label: 'GitHub', icon: 'github', group: 'call', outputLanguage: 'text',
        describeCall: (input) => {
            const op = inputText(input, 'op');
            const target = inputText(input, 'repo', 'query', 'branch');
            const parts = [op, target].filter(Boolean);
            return parts.length > 0 ? parts.join(' · ') : null;
        },
        describeResult: (result) => {
            const parsed = githubDetailsSchema.safeParse(result).data;
            if (!parsed) return null;
            const state = text(parsed.conclusion) ?? text(parsed.status);
            const failedCount = parsed.failedJobs?.length ?? 0;
            const failedPart = failedCount > 0 ? tt('chat.toolPart.summary.failedCount', { count: failedCount }) : null;
            const parts = [state, failedPart].filter(Boolean);
            return parts.length > 0 ? parts.join(' · ') : null;
        },
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
    checkpoint: {
        label: 'Checkpoint', icon: 'history', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'goal'),
        describeResult: () => null,
    },
    rewind: {
        label: 'Rewind', icon: 'history', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'report'),
        describeResult: () => null,
    },
    resolve: {
        label: 'Resolve', icon: 'checkbox', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'reason'),
        describeResult: (result) => detailText(result, 'action'),
    },
    propose: {
        label: 'Propose', icon: 'checkbox', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'title'),
        describeResult: (result) => detailText(result, 'action') ?? detailText(result, 'title'),
    },
    reject: {
        label: 'Reject', icon: 'checkbox', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'reason'),
        describeResult: (result) => detailText(result, 'action'),
    },
    context_notes: {
        label: 'Context notes', icon: 'book-open', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'text'),
        describeResult: (result) => detailNumber(result, 'bytes') !== null ? `${detailNumber(result, 'bytes')} bytes` : null,
    },
    new_context: {
        label: 'New context', icon: 'book-open', group: 'call', outputLanguage: 'text',
        describeCall: () => null,
        describeResult: (result) => newContextDetailsSchema.safeParse(result).data?.requested === true
            ? tt('chat.toolPart.summary.requested')
            : null,
    },
    security_scan: {
        label: 'Security scan', icon: 'shield-check', group: 'call', outputLanguage: 'text',
        describeCall: (input) => {
            const action = inputText(input, 'action');
            const target = inputText(input, 'plan_id', 'operation_id', 'scan_id', 'finding_id');
            const parts = [action, target].filter(Boolean);
            return parts.length > 0 ? parts.join(' · ') : null;
        },
        describeResult: (result) => {
            const parsed = securityScanDetailsSchema.safeParse(result).data;
            if (!parsed) return null;
            return text(parsed.operation?.status)
                ?? text(parsed.finding?.validationStatus)
                ?? (parsed.cancelled === true ? 'cancelled' : null);
        },
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
    generate_image: {
        label: 'Generate image', icon: 'image', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'subject', 'prompt', 'action'),
        describeResult: (result) => {
            const parsed = imageGenDetailsSchema.safeParse(result).data;
            if (!parsed) return null;
            const count = parsed.imageCount ?? parsed.imagePaths?.length ?? null;
            const countPart = count !== null
                ? (count === 1
                    ? tt('chat.toolPart.summary.imageSingle', { count })
                    : tt('chat.toolPart.summary.imagePlural', { count }))
                : null;
            const provider = parsed.provider?.trim();
            const model = parsed.model?.trim();
            const modelPart = provider && model ? modelRefKey(provider, model) : (model || provider || null);
            const parts = [countPart, modelPart].filter(Boolean);
            return parts.length > 0 ? parts.join(' · ') : null;
        },
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
    yield: {
        label: 'Yield', icon: 'send-plane', group: 'call', outputLanguage: 'text',
        describeCall: (input) => {
            const typeLabel = formatYieldType(yieldTypeSchema.safeParse(input.type).data);
            if (typeLabel) return typeLabel;
            const keyNum = z.number().safeParse(input.key).data;
            if (keyNum !== undefined) return `#${keyNum}`;
            return inputText(input, 'key');
        },
        describeResult: (result) => {
            const parsed = yieldDetailsSchema.safeParse(result).data;
            if (!parsed) return null;
            const parts = [text(parsed.status), formatYieldType(parsed.type)].filter(Boolean);
            return parts.length > 0 ? parts.join(' · ') : null;
        },
    },
    goal: {
        label: 'Goal', icon: 'flag', group: 'call', outputLanguage: 'text',
        describeCall: (input) => {
            const op = inputText(input, 'op');
            const objective = inputText(input, 'objective');
            const parts = [op, objective].filter(Boolean);
            return parts.length > 0 ? parts.join(' · ') : null;
        },
        describeResult: (result) => text(goalDetailsSchema.safeParse(result).data?.goal?.status),
    },
    report_issue: {
        label: 'Report issue', icon: 'bug', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'report'),
        describeResult: () => null,
    },
    think: {
        label: 'Think', icon: 'brain-ai-3', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'thoughts'),
        describeResult: (result) => thinkDetailsSchema.safeParse(result).data?.recorded === true
            ? tt('chat.toolPart.summary.recorded')
            : null,
    },
    advise: {
        label: 'Advise', icon: 'lightbulb', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'note'),
        describeResult: (result) => detailText(result, 'severity'),
    },
    vibe_spawn: {
        label: 'Vibe spawn', icon: 'ai-agent', group: 'call', outputLanguage: 'text',
        describeCall: (input) => {
            const cli = inputText(input, 'cli');
            const target = inputText(input, 'name', 'prompt');
            const parts = [cli, target].filter(Boolean);
            return parts.length > 0 ? text(parts.join(' · ')) : null;
        },
        describeResult: (result) => {
            const spawned = vibeToolDetailsSchema.safeParse(result).data?.spawned;
            if (!spawned) return null;
            return text(`${spawned.id} · ${spawned.cli}`);
        },
    },
    vibe_send: {
        label: 'Vibe send', icon: 'send-plane', group: 'call', outputLanguage: 'text',
        describeCall: (input) => {
            const session = inputText(input, 'session');
            const snippet = text(input.message, 80);
            if (session && snippet) return text(`→ ${session} · ${snippet}`);
            if (session) return text(`→ ${session}`);
            return snippet;
        },
        describeResult: (result) => {
            const send = vibeToolDetailsSchema.safeParse(result).data?.send;
            if (!send) return null;
            return text(`${send.id} · ${send.mode}`);
        },
    },
    vibe_wait: {
        label: 'Vibe wait', icon: 'time', group: 'call', outputLanguage: 'text',
        describeCall: (input) => {
            const sessions = z.array(z.string()).safeParse(input.sessions).data
                ?.map((entry) => entry.trim())
                .filter(Boolean);
            if (sessions && sessions.length > 0) {
                return text(sessions.join(', '));
            }
            const timeout = z.number().safeParse(input.timeout).data;
            return timeout !== undefined ? `${timeout}s` : null;
        },
        describeResult: (result) => {
            const parsed = vibeToolDetailsSchema.safeParse(result).data;
            const wait = parsed?.wait;
            if (!wait) return null;
            if (wait.waiting === true && wait.settled.length === 0 && wait.stillRunning.length === 0 && !wait.timedOut) {
                const runningScreens = parsed.screens.filter((screen) => screen.state === 'running' || screen.state === 'starting').length;
                return runningScreens > 0 ? tt('chat.toolPart.summary.vibeRunning', { count: runningScreens }) : null;
            }
            const parts = [
                tt('chat.toolPart.summary.vibeSettled', { count: wait.settled.length }),
                tt('chat.toolPart.summary.vibeRunning', { count: wait.stillRunning.length }),
                wait.timedOut ? tt('chat.toolPart.summary.timedOut') : null,
            ].filter(Boolean);
            return parts.join(' · ');
        },
    },
    vibe_kill: {
        label: 'Vibe kill', icon: 'close', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'session'),
        describeResult: (result) => {
            const killed = vibeToolDetailsSchema.safeParse(result).data?.killed;
            if (!killed) return null;
            const parts = [
                killed.id,
                tt('chat.toolPart.summary.killed'),
                killed.cancelledTurn ? tt('chat.toolPart.summary.cancelledTurn') : null,
            ].filter(Boolean);
            return parts.join(' · ');
        },
    },
    vibe_list: {
        label: 'Vibe list', icon: 'layout', group: 'call', outputLanguage: 'text',
        describeCall: () => '',
        describeResult: (result) => {
            const parsed = vibeToolDetailsSchema.safeParse(result).data;
            if (!parsed) return null;
            const total = parsed.screens.length;
            const active = parsed.screens.filter((screen) => screen.state === 'running' || screen.state === 'starting').length;
            const countLabel = total === 1
                ? tt('chat.toolPart.summary.sessionSingle', { count: total })
                : tt('chat.toolPart.summary.sessionsPlural', { count: total });
            if (active > 0) {
                return `${countLabel} · ${tt('chat.toolPart.summary.activeCount', { count: active })}`;
            }
            return countLabel;
        },
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
