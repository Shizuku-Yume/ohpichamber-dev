
import type { JsonValue } from 'ohpichamber-sdk';
import type { AttachedFile } from '@/stores/types/sessionTypes';
import type { SourceControlProvider } from '@/lib/api/types';
import type { InlineCommentDraft } from '@/stores/useInlineCommentDraftStore';
import type { QueuedContextPart, QueuedMessage } from '@/stores/messageQueueStore';
import { withoutShareLinkKeys } from '@/lib/received-pages/link';
import { contextPayloadFromDraft, createContextPart, type ContextPartMetadata, type ContextPartPayload } from '@/lib/messages/contextParts';

export interface OutgoingPart {
    text: string;
    attachments?: AttachedFile[];
    synthetic?: boolean;
    metadata?: ContextPartMetadata;
    /** This queued text already passed through native expansion at capture time. */
    fileResourcesExpanded?: boolean;
}

export interface OutgoingMessage {
    primaryText: string;
    primaryFileResourcesExpanded: boolean;
    primaryAttachments: AttachedFile[];
    additionalParts: OutgoingPart[];
    /**
     * Skills the composer text names inline, deduped in order of appearance.
     * The send attaches them to the prompt (see `SkillMentions`); queued
     * messages already carry the instruction they were queued with.
     */
    skillNames: string[];
    isEmpty: boolean;
}

export interface QueuedInput {
    text: string;
    attachments?: AttachedFile[];
    context?: readonly QueuedContextPart[];
}

export const selectComposerQueue = (messages: readonly QueuedMessage[]): readonly QueuedMessage[] =>
    messages.some((message) => message.scheduledTask)
        ? messages.filter((message) => !message.scheduledTask)
        : messages;

export type ComposerContextReference =
    | { kind: 'repository-issue'; provider?: SourceControlProvider; number: number; title: string; url: string; contextText: string }
    | { kind: 'change-request'; provider: SourceControlProvider; number: number; title: string; url: string; context: string }
    | { kind: 'linear-issue'; identifier: string; title: string; url: string; contextText: string }
    | { kind: 'repository-discussion'; provider: SourceControlProvider; number: number; title: string; url: string; contextText: string }
    | { kind: 'tracker-item'; provider: string; identifier: string; title: string; url: string; contextText: string }
    | { kind: 'session'; sessionId: string; title: string; contextText: string; messageId?: string }
    | { kind: 'session-message'; sessionId: string; messageId: string; sessionTitle: string; excerpt: string; contextText: string }
    | {
        kind: 'guest';
        providerId: string;
        id: string;
        title: string;
        url: string;
        contextText: string;
        thread?: 'issue' | 'pull';
        data?: JsonValue;
    };

export interface ComposerContextInput {
    inlineComments: readonly InlineCommentDraft[];
    syntheticTexts: readonly string[];
    references: readonly ComposerContextReference[];
}

export interface OutgoingMessageInput extends ComposerContextInput {
    queued: readonly QueuedInput[];
    composerText: string | null;
    composerAttachments: readonly AttachedFile[];
}

export interface OutgoingMessageDeps {
    /** Resolve `@path` references into server-side attachments. */
    extractFileMentions: (text: string) => { text: string; attachments: AttachedFile[] };
    sanitizeAttachments: (files: readonly AttachedFile[] | undefined) => AttachedFile[];
    collectSkillNames: (text: string) => string[];
}

export function buildOutgoingMessage(
    input: OutgoingMessageInput,
    deps: OutgoingMessageDeps,
): OutgoingMessage {
    let primaryText = '';
    let primaryAttachments: AttachedFile[] = [];
    const additionalParts: OutgoingPart[] = [];

    const skillNames: string[] = [];
    const noteSkills = (text: string) => {
        for (const name of deps.collectSkillNames(text)) {
            if (!skillNames.includes(name)) skillNames.push(name);
        }
    };

    /** Run a body through mention parsing, collecting its side effects. */
    const resolve = (raw: string) => {
        const mentions = deps.extractFileMentions(raw);
        noteSkills(mentions.text);
        return mentions;
    };

    // Queued messages come first, in the order they were queued: the oldest
    // becomes the primary message so the turn reads chronologically. Each one
    // is followed by the context it was queued with.
    input.queued.forEach((queued, index) => {
        const attachments = deps.sanitizeAttachments(queued.attachments);

        if (index === 0) {
            primaryText = queued.text;
            primaryAttachments = attachments;
        } else {
            additionalParts.push({ text: queued.text, attachments, fileResourcesExpanded: true });
        }
        additionalParts.push(...queuedContextToParts(queued.context ?? []));
    });

    // The composer's own text follows, becoming primary only when nothing was
    // queued ahead of it.
    if (input.composerText !== null) {
        const resolved = resolve(input.composerText.replace(/^\n+|\n+$/g, ''));
        const attachments = [
            ...deps.sanitizeAttachments(input.composerAttachments),
            ...resolved.attachments,
        ];

        if (input.queued.length === 0) {
            primaryText = resolved.text;
            primaryAttachments = attachments;
        } else {
            additionalParts.push({ text: resolved.text, attachments });
        }
    }

    additionalParts.push(...queuedContextToParts(
        buildComposerContext(input, null),
    ));

    return {
        primaryText,
        primaryFileResourcesExpanded: input.queued.length > 0,
        primaryAttachments,
        additionalParts,
        skillNames,
        isEmpty: !primaryText && primaryAttachments.length === 0 && additionalParts.length === 0,
    };
}

export function buildComposerContext(
    input: ComposerContextInput,
    skillInstruction: string | null,
): QueuedContextPart[] {
    const context: QueuedContextPart[] = [];
    const attach = (part: { text: string; metadata: ContextPartMetadata }) => {
        context.push({ kind: 'context', text: part.text, metadata: part.metadata });
    };

    for (const draft of input.inlineComments) {
        attach(createContextPart(contextPayloadFromDraft(draft)));
    }

    for (const text of input.syntheticTexts) {
        context.push({ kind: 'synthetic', text });
    }

    for (const reference of input.references) {
        switch (reference.kind) {
            case 'repository-issue': {
                const { provider, number, title, url, contextText } = reference;
                attach(createContextPart({ kind: 'repository-issue', ...(provider ? { provider } : {}), number, title, url }, contextText));
                break;
            }
            case 'change-request': {
                const { provider, number, title, url, context: prContext } = reference;
                attach(createContextPart({ kind: 'change-request', provider, number, title, url }, prContext));
                break;
            }
            case 'linear-issue': {
                const { identifier, title, url, contextText } = reference;
                attach(createContextPart({ kind: 'tracker-item', provider: 'linear', identifier, title, url }, contextText));
                break;
            }
            case 'tracker-item': {
                const { provider, identifier, title, url, contextText } = reference;
                attach(createContextPart({ kind: 'tracker-item', provider, identifier, title, url }, contextText));
                break;
            }
            case 'repository-discussion': {
                const { provider, number, title, url, contextText } = reference;
                attach(createContextPart({ kind: 'repository-discussion', provider, number, title, url }, contextText));
                break;
            }
            case 'session': {
                const { sessionId, title, contextText, messageId } = reference;
                const payload: Extract<ContextPartPayload, { kind: 'session' }> = { kind: 'session', sessionId, title };
                if (messageId) payload.messageId = messageId;
                attach(createContextPart(payload, contextText));
                break;
            }
            case 'session-message': {
                const { sessionId, messageId, sessionTitle, excerpt, contextText } = reference;
                attach(createContextPart({ kind: 'session-message', sessionId, messageId, sessionTitle, excerpt }, contextText));
                break;
            }
            case 'guest': {
                const { providerId, id, title, url, contextText, thread, data } = reference;
                const payload: Extract<ContextPartPayload, { kind: 'guest-issue' | 'guest-pr' }> = {
                    kind: thread === 'pull' ? 'guest-pr' : 'guest-issue',
                    providerId,
                    id,
                    title,
                    url,
                };
                if (data !== undefined) {
                    payload.data = data;
                }
                attach(createContextPart(payload, contextText));
                break;
            }
        }
    }

    if (skillInstruction) {
        context.push({ kind: 'instruction', text: skillInstruction });
    }

    return context;
}

export function queuedContextToParts(context: readonly QueuedContextPart[]): OutgoingPart[] {
    const parts: OutgoingPart[] = [];
    for (const part of context) {
        if (part.kind !== 'context') {
            parts.push({ text: part.text, synthetic: true });
            continue;
        }
        if (part.instructions) parts.push({ text: part.instructions, synthetic: true });
        parts.push({ text: part.text, synthetic: true, metadata: part.metadata });
    }
    return parts;
}

export async function expandCommentSnippets(
    drafts: readonly InlineCommentDraft[],
    expandText: (text: string) => Promise<string>,
): Promise<InlineCommentDraft[]> {
    return Promise.all(drafts.map(async (draft) => {
        if (!draft.text) return draft;
        const text = await expandText(draft.text);
        return text === draft.text ? draft : { ...draft, text };
    }));
}
