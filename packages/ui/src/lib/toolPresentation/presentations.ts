import type { JsonObject, JsonValue } from '@openchamber/agent-contract';
import { z } from 'zod';

import type { ToolGroup, ToolPresentation } from './types';
import { evalResultSummary } from './toolView';
import { parseEditInputPaths } from './editInputPaths';
import { normalizeIntent } from './intent';

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
    value && typeof value === 'object' && !Array.isArray(value) ? value[key] : undefined;

const detailNumber = (value: JsonValue | undefined, key: string): number | null => {
    const field = detailValue(value, key);
    return typeof field === 'number' ? field : null;
};

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
    if (typeof input.input !== 'string') return null;
    const paths = parseEditInputPaths(input.input);
    if (paths.length === 0) return null;
    return paths.length === 1 ? text(paths[0]) : text(`${paths[0]} (+${paths.length - 1})`);
};

const editSummary: ToolPresentation['describeResult'] = (result) =>
    diffStats(detailText(result, 'diff') ?? '') ?? detailText(result, 'message');

const jsonSummary: ToolPresentation['describeResult'] = (result) => {
    const root = result && typeof result === 'object' && !Array.isArray(result) ? result : null;
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
    const rawData = detailValue(result, 'data');
    if (rawData && typeof rawData === 'object' && !Array.isArray(rawData)) {
        const entries = Object.entries(rawData);
        if (entries.length > 0) {
            const answered = entries.filter(([, value]) => {
                if (value === null || value === undefined) return false;
                if (typeof value === 'string') return value.trim().length > 0;
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
    if (typeof detailValue(result, 'chatRedirect') === 'boolean' && detailValue(result, 'chatRedirect') === true) return 'sent to chat';
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

const taskProgressItemSchema = z.object({ status: z.string().optional() });
const taskAsyncSchema = z.object({ state: z.string().optional() });

const taskSummary: ToolPresentation['describeResult'] = (result) => {
    const results = z.array(z.unknown()).safeParse(detailValue(result, 'results')).data;
    const progress = z.array(taskProgressItemSchema).safeParse(detailValue(result, 'progress')).data;
    const asyncInfo = taskAsyncSchema.safeParse(detailValue(result, 'async')).data;
    const count = Math.max(progress?.length ?? 0, results?.length ?? 0);
    const countLabel = count > 0 ? `${count} ${count === 1 ? 'subagent' : 'subagents'}` : null;
    const asyncState = asyncInfo?.state?.trim();
    if (asyncState === 'running' || asyncState === 'failed' || asyncState === 'completed') {
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

const hostCall: ToolPresentation['describeCall'] = (input) => {
    const action = z.object({ action: z.string().optional(), input: z.record(z.string(), z.unknown()).optional() }).safeParse(input).data;
    if (!action?.action) return null;
    const salient = action.input ? Object.values(action.input).find((item) => typeof item === 'string') : undefined;
    return typeof salient === 'string' && salient.trim() ? `${action.action}: ${salient.trim().slice(0, 120)}` : action.action;
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
    debug: plainTool('Debug', 'bug', ['action', 'program']),
    ida: plainTool('IDA', 'bug', ['action', 'target']),
    eval: {
        label: 'Eval', icon: 'code', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'title', 'language', 'code'),
        describeResult: evalResultSummary,
    },
    github: plainTool('GitHub', 'github', ['op', 'repo', 'query']),
    glob: queryTool('Glob', 'file-search', ['path', 'pattern']),
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
        describeCall: (input) => inputText(input, 'action', 'id'),
        describeResult: (result) => detailText(result, 'action'),
    },
    propose: {
        label: 'Propose', icon: 'checkbox', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'action', 'id'),
        describeResult: (result) => detailText(result, 'action'),
    },
    reject: {
        label: 'Resolve', icon: 'checkbox', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'action', 'id'),
        describeResult: (result) => detailText(result, 'action'),
    },
    context_notes: {
        label: 'Context notes', icon: 'book-open', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'text'),
        describeResult: (result) => detailNumber(result, 'bytes') !== null ? `${detailNumber(result, 'bytes')} bytes` : null,
    },
    new_context: plainTool('New context', 'book-open'),
    security_scan: plainTool('Security scan', 'shield-check', ['action', 'plan_id']),
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
        describeCall: (input) => inputText(input, 'prompt', 'subject'),
        describeResult: (result) => {
            const count = detailNumber(result, 'imageCount') ?? (Array.isArray(detailValue(result, 'imagePaths')) ? (detailValue(result, 'imagePaths') as unknown[]).length : null);
            return count !== null ? `${count} ${count === 1 ? 'image' : 'images'}` : null;
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
    yield: plainTool('Yield', 'send-plane'),
    goal: plainTool('Goal', 'flag', ['op']),
    report_issue: plainTool('Report issue', 'bug', ['title', 'description']),
    think: plainTool('Think', 'brain-ai-3'),
    advise: {
        label: 'Advise', icon: 'lightbulb', group: 'call', outputLanguage: 'text',
        describeCall: (input) => inputText(input, 'note'),
        describeResult: (result) => detailText(result, 'severity'),
    },
    vibe_spawn: plainTool('Vibe spawn', 'ai-agent', ['cli', 'prompt']),
    vibe_send: plainTool('Vibe send', 'send-plane', ['id', 'message']),
    vibe_wait: plainTool('Vibe wait', 'time', ['id']),
    vibe_kill: plainTool('Vibe kill', 'close', ['id']),
    vibe_list: plainTool('Vibe list', 'layout'),
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
export const fallbackPresentation = (toolName: string): ToolPresentation => ({
    label: toolName || 'Tool',
    icon: 'tools',
    group: 'call',
    outputLanguage: 'text',
    describeCall: () => null,
    describeResult: () => null,
});
