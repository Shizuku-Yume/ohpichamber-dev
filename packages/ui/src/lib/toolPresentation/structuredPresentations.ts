import { modelRefKey } from '@openchamber/agent-contract';
import { z } from 'zod';

import { detailNumber, detailText, inputText, text, tt } from './helpers';
import type { ToolPresentation } from './types';

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

const formatYieldType = (value: string | string[] | undefined): string | null => {
    const single = z.string().safeParse(value).data;
    if (single !== undefined) return text(single);
    if (Array.isArray(value)) {
        const joined = value.map((entry) => entry.trim()).filter(Boolean).join(', ');
        return joined ? text(joined) : null;
    }
    return null;
};

export const STRUCTURED_TOOL_PRESENTATIONS = {
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
} satisfies Record<string, ToolPresentation>;
