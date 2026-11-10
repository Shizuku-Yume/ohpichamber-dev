import { z } from 'zod';

import type { JsonValue } from '@openchamber/agent-contract';
import type { CanonicalToolState, CanonicalToolView, RenderedPageAsk, RequestedSecret, RequestedSecretRun } from './toolView';

/**
 * Which of OpenChamber's own calls the chat draws in place instead of as a
 * tool row: the page `openchamber_render` showed, the run `openchamber_workflow`
 * proposed, the images `openchamber_image` saved, the card `openchamber_secret`
 * asks on.
 *
 * The rules live here because the canonical contract stores a call and its
 * result separately; everything below reads the joined view from `toolView.ts`
 * and never an engine shape.
 */

const OPENCHAMBER_RENDER_TOOL = 'openchamber_render';
const OPENCHAMBER_SECRET_TOOL = 'openchamber_secret';
const OPENCHAMBER_WORKFLOW_TOOL = 'openchamber_workflow';
const OPENCHAMBER_IMAGE_TOOL = 'openchamber_image';

const openChamberCallAwaits = z
    .object({
        action: z.string().optional().catch(undefined),
        awaitAnswer: booleanish,
        parameters: z.object({ awaitAnswer: booleanish }).optional().catch(undefined),
    })
    .catch({});

const optionalText = z.string().trim().min(1).optional().catch(undefined);
const booleanish = z
    .union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')])
    .optional()
    .catch(undefined);

const renderPageFields = z.object({
    html: z.string().optional().catch(undefined),
    ui: z.string().optional().catch(undefined),
    title: optionalText,
    awaitAnswer: booleanish,
});

const renderPageInputSchema = renderPageFields
    .extend({ parameters: renderPageFields.optional().catch(undefined) })
    .catch({});

const secretRequestFields = z.object({
    label: optionalText,
    reason: optionalText,
    placeholder: optionalText,
});

const secretRequestInputSchema = secretRequestFields
    .extend({ parameters: secretRequestFields.optional().catch(undefined) })
    .catch({});

const secretRunField = z.object({
    env: z.string().trim().min(1),
    label: z.string().trim().min(1),
    placeholder: optionalText,
});

const secretRunFields = z.object({
    program: optionalText,
    args: z.array(z.string()).optional().catch(undefined),
    reason: optionalText,
    inputs: z.array(secretRunField).min(1).optional().catch(undefined),
});

const secretRunInputSchema = secretRunFields
    .extend({ action: z.string().optional().catch(undefined), parameters: secretRunFields.optional().catch(undefined) })
    .catch({});

const pageAnswerSchema = z.object({
    answered: z.boolean(),
    summary: z.string().optional().catch(undefined),
    data: z.unknown().optional().catch(undefined),
    reason: z.string().optional().catch(undefined),
});

const openChamberResultSchema = z
    .object({
        openchamber: z.object({
            ok: z.boolean().optional().catch(undefined),
            answer: pageAnswerSchema.optional().catch(undefined),
        }).optional().catch(undefined),
    })
    .catch({});

const proposedWorkflowResultSchema = z.object({
    ok: z.literal(true),
    action: z.literal('workflow.run'),
    data: z.object({ runId: z.string().min(1) }),
});

const generatedImagesResultSchema = z.object({
    ok: z.literal(true),
    action: z.literal('image.generate'),
    data: z.object({ images: z.array(z.object({ path: z.string().min(1) })).min(1) }),
});

const TITLE_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' } as const;
const RENDER_PAGE_MAX_TITLE_LENGTH = 120;

const elementText = (html: string, pattern: RegExp): string => (pattern.exec(html)?.[1] ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, entity: keyof typeof TITLE_ENTITIES) => TITLE_ENTITIES[entity])
    .replace(/\s+/g, ' ')
    .trim();

const pageTitleFromHtml = (html: string): string => (
    elementText(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i)
    || elementText(html, /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i)
).slice(0, RENDER_PAGE_MAX_TITLE_LENGTH).trim();

/** The structured envelope an OpenChamber tool result carries, if any. */
const resultEnvelope = (state: CanonicalToolState, key: string): JsonValue | undefined => {
    if ('metadata' in state) {
        const value = state.metadata[key];
        if (value !== undefined) return value;
    }
    if ('output' in state && typeof state.output === 'string') {
        try {
            const parsed = JSON.parse(state.output) as Record<string, JsonValue>;
            if (parsed !== null && typeof parsed === 'object' && key in parsed) return parsed[key];
            return parsed as JsonValue;
        } catch {
            return undefined;
        }
    }
    return undefined;
};

/** The page an `openchamber_render` call showed, else null. */
export const renderedPage = (view: CanonicalToolView): ({ html: string; ui?: string; title: string; ask: RenderedPageAsk }) | null => {
    if (view.tool !== OPENCHAMBER_RENDER_TOOL) return null;
    const state = view.state;
    const parsed = renderPageInputSchema.parse(state.input ?? {});
    const html = parsed.parameters?.html ?? parsed.html ?? '';
    const ui = parsed.parameters?.ui ?? parsed.ui;
    const page = ui?.trim() ? { html: '', ui } : html.trim() ? { html } : null;
    if (!page) return null;
    const title = (parsed.parameters?.title ?? parsed.title)?.trim() || pageTitleFromHtml(html);
    if ((parsed.parameters?.awaitAnswer ?? parsed.awaitAnswer) === true) {
        if (state.status === 'running') return { ...page, title, ask: { kind: 'waiting' } };
        if (state.status === 'error') return { ...page, title, ask: { kind: 'unanswered' } };
    }
    if (state.status !== 'completed') return null;
    const envelope = openChamberResultSchema.parse(resultEnvelope(state, 'openchamber') ?? {}).openchamber;
    if (envelope?.ok !== true) return null;
    const answer = envelope.answer;
    if (answer?.answered === true) {
        return {
            ...page,
            title,
            ask: { kind: 'answered', summary: answer.summary ?? '', data: answer.data as JsonValue },
        };
    }
    if (answer?.answered === false) {
        const reason = answer.reason;
        const kind = reason === 'chat-sent-earlier' ? 'chat-sent-earlier'
            : reason === 'ui-not-drawn' ? 'not-drawn'
                : reason === 'declined' ? 'declined'
                    : 'answered-in-chat';
        return { ...page, title, ask: { kind } };
    }
    return { ...page, title, ask: { kind: 'show' } };
};

/** The workflow run an `openchamber_workflow` call proposed, else null. */
export const proposedWorkflowRunId = (view: CanonicalToolView): string | null => {
    if (view.tool !== OPENCHAMBER_WORKFLOW_TOOL || view.state.status !== 'completed') return null;
    const envelope = resultEnvelope(view.state, 'ok');
    const parsed = proposedWorkflowResultSchema.safeParse(envelope);
    return parsed.success ? parsed.data.data.runId : null;
};

/** The files an `openchamber_image` call saved, in order. */
export const generatedImagePaths = (view: CanonicalToolView): string[] => {
    if (view.tool !== OPENCHAMBER_IMAGE_TOOL || view.state.status !== 'completed') return [];
    const envelope = resultEnvelope(view.state, 'ok');
    const parsed = generatedImagesResultSchema.safeParse(envelope);
    return parsed.success ? parsed.data.data.images.map((image) => image.path) : [];
};


export const secretRunCommandLine = (program: string, args: readonly string[]): string => {
    const hidden = (code: number) => code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x61c
        || (code >= 0x200b && code <= 0x200f) || (code >= 0x2028 && code <= 0x202e)
        || (code >= 0x2060 && code <= 0x2069) || code === 0xfeff;
    const visible = (value: string) => Array.from(value, (char) => {
        const code = char.codePointAt(0) ?? 0;
        return hidden(code) ? `\\u{${code.toString(16).toUpperCase().padStart(4, '0')}}` : char;
    }).join('');
    const word = (value: string) => (/^[A-Za-z0-9_/.,:=@%+-]+$/.test(value) ? value : `'${visible(value).replaceAll("'", "'\\''")}'`);
    return [program, ...args].map(word).join(' ');
};

/** The card a running `secret.run` call asks on, else null. */
export const requestedSecretRun = (view: CanonicalToolView): RequestedSecretRun | null => {
    if (view.tool !== OPENCHAMBER_SECRET_TOOL || view.state.status !== 'running') return null;
    const parsed = secretRunInputSchema.parse(view.state.input ?? {});
    if (parsed.action !== 'secret.run' && parsed.action !== 'run') return null;
    const program = parsed.parameters?.program ?? parsed.program;
    const reason = parsed.parameters?.reason ?? parsed.reason;
    const inputs = parsed.parameters?.inputs ?? parsed.inputs;
    if (!program || !reason || !inputs) return null;
    const args = parsed.parameters?.args ?? parsed.args ?? [];
    return {
        reason,
        program,
        command: secretRunCommandLine(program, args),
        fields: inputs.map((field) => ({ env: field.env, label: field.label, placeholder: field.placeholder })),
    };
};

/** The card a running `secret.request` call asks on, else null. */
export const requestedSecret = (view: CanonicalToolView): RequestedSecret | null => {
    if (view.tool !== OPENCHAMBER_SECRET_TOOL || view.state.status !== 'running') return null;
    const action = secretRunInputSchema.parse(view.state.input ?? {}).action;
    if (action === 'secret.run' || action === 'run' || action === 'secret.forget' || action === 'forget') return null;
    const parsed = secretRequestInputSchema.parse(view.state.input ?? {});
    const label = parsed.parameters?.label ?? parsed.label;
    const reason = parsed.parameters?.reason ?? parsed.reason;
    if (!label || !reason) return null;
    return { label, reason, placeholder: parsed.parameters?.placeholder ?? parsed.placeholder };
};

/**
 * A form or secret card that asked the user and no longer waits: answered,
 * answered in the chat instead, or stopped. Like the question tool's card it
 * is a step from then on, so a collapsed Activity folds it.
 */
export const isSettledAsk = (view: CanonicalToolView): boolean => (
    view.state.status !== 'running' && view.state.status !== 'pending'
    && (view.tool === OPENCHAMBER_RENDER_TOOL || view.tool === OPENCHAMBER_SECRET_TOOL)
    && (() => {
        const parsed = openChamberCallAwaits.parse(view.state.input ?? {});
        return parsed.awaitsAnswer === true;
    })()
);

/** Whether the chat draws what a call showed instead of its tool row. */
export const isShownInPlace = (view: CanonicalToolView): boolean => (
    renderedPage(view) !== null
    || proposedWorkflowRunId(view) !== null
    || generatedImagePaths(view).length > 0
    || requestedSecret(view) !== null
    || requestedSecretRun(view) !== null
);
