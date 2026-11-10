/**
 * One pass over the composer text producing every highlight range.
 *
 * The composer used to derive its highlighting from six independent memos in
 * ChatInput.tsx — markdown, fenced-code syntax, mentions, slash tokens,
 * snippet tokens and attachment citations — each re-scanning the same string
 * and each having to be remembered when a new construct was added. This is the
 * single entry point: give it the text and what the composer knows about the
 * workspace, get back the ranges.
 *
 * It is also the seam the editor renders through. The mirror overlay consumes
 * these ranges via `buildHighlightParts`; a CodeMirror view maps the same
 * ranges to decorations. Adding a construct to the language means adding it
 * here, once.
 */

import { findAttachmentCitationRanges } from '../../attachmentCitations';
import { highlightFencedCode } from '../../composerCodeHighlight';
import {
    mentionRangesToHighlightRanges,
    tokenizeMarkdown,
    type HighlightRange,
    type MentionRange,
} from '../../composerHighlight';
import { classifyMention, scanMentions } from './mentions';
import { pathHighlightRanges } from './paths';
import { filterKnownTokens, scanPrefixTokens } from './prefixTokens';

/**
 * What the composer knows about its workspace while tokenizing. Every set is
 * authoritative: a token is only a reference if it resolves against one of
 * them, so unknown `/tokens` and `@words` stay plain prose.
 */
export interface ComposerLanguageContext {
    /** Shell mode (`!cmd`) is not the prompt language — nothing is tokenized. */
    inputMode: 'normal' | 'shell';
    /** Lowercased names of the agents that can be mentioned. */
    knownAgentNames: ReadonlySet<string>;
    /** See `MentionClassifier.confirmedMentions`. A live set, read on every pass. */
    confirmedMentions: ReadonlySet<string>;
    /** Changes when `confirmedMentions` did without the text changing, to repaint. */
    confirmedMentionsRevision?: number;
    /**
     * Lets a double click turn a file or agent chip back into text. `dismiss`
     * records it in `confirmedMentions`; `hint` joins the chip's tooltip.
     */
    mentionDismissal?: { dismiss: (name: string) => void; hint: string };
    /** Lowercased command and built-in names invocable with `/`. */
    knownSlashNames: ReadonlySet<string>;
    /** Native prompt template names invocable with a leading `/`. */
    knownSnippetTriggers: ReadonlySet<string>;
    /** Filenames of the currently attached files, cited inline as `[name]`. */
    attachmentFilenames: readonly string[];
    /**
     * Names cited before their file finished attaching. A live set, like
     * `confirmedMentions`: filled before the citation text is inserted, so the
     * chip appears with the text instead of a frame later.
     */
    pendingAttachmentFilenames?: ReadonlySet<string>;
    /** Lowercased skill names invocable with `$`; a completed `$skill` token renders as a chip. Empty when absent. */
    knownSkillNames?: ReadonlySet<string>;
    /** Theme variant for the file-type icons on citation chips; dark when absent. */
    fileIconVariant?: 'light' | 'dark';
    /**
     * The session or message each `[[…]]` link mention resolves to, keyed by
     * `sessionLinkKey`; without it a resolved link stays plain text.
     */
    sessionLinkChips?: ReadonlyMap<string, { label: string; title: string; iconHref: string }>;
    /** Link origins the mention syntax accepts; the app's own when absent. */
    sessionLinkOrigins?: readonly string[];
}

/** Mention ranges alone — the composer also needs these to resolve references. */
export function tokenizeMentions(
    text: string,
    context: Pick<ComposerLanguageContext, 'knownAgentNames' | 'confirmedMentions'>,
): MentionRange[] {
    const ranges: MentionRange[] = [];
    for (const token of scanMentions(text, context.confirmedMentions)) {
        const kind = classifyMention(token.name, context);
        if (kind) ranges.push({ start: token.start, end: token.end, kind });
    }
    return ranges;
}

/**
 * Every highlight range in `text`. Ranges may overlap; `buildHighlightParts`
 * resolves them by priority.
 */
export function tokenizeComposer(
    text: string,
    context: ComposerLanguageContext,
): HighlightRange[] {
    if (!text || context.inputMode === 'shell') return [];

    const ranges: HighlightRange[] = [
        ...tokenizeMarkdown(text),
        ...highlightFencedCode(text),
        ...mentionRangesToHighlightRanges(tokenizeMentions(text, context)),
        // `~path` is inert: highlighted for the reader, never attached.
        ...pathHighlightRanges(text),
    ];

    for (const token of filterKnownTokens(scanPrefixTokens(text, '/'), context.knownSlashNames)) {
        ranges.push({ start: token.start, end: token.end, style: 'mentionCommand' });
    }

    if (context.knownSkillNames) {
        for (const token of filterKnownTokens(scanPrefixTokens(text, '$'), context.knownSkillNames)) {
            ranges.push({ start: token.start, end: token.end, style: 'mentionCommand' });
        }
    }

    for (const token of filterKnownTokens(scanPrefixTokens(text, '/'), context.knownSnippetTriggers)) {
        ranges.push({ start: token.start, end: token.end, style: 'mentionSnippet' });
    }

    if (context.attachmentFilenames.length > 0 && text.includes('[')) {
        for (const range of findAttachmentCitationRanges(text, [...context.attachmentFilenames])) {
            ranges.push({ ...range, style: 'mentionFile' });
        }
    }
    const nonProseRanges = [...highlightFencedCode(text), ...tokenizeMarkdown(text).filter(r => r.style === 'code' || r.style === 'codeFence')];

    const LEFT_BOUNDARY = String.raw`(?<![\p{L}\p{N}_./\\-])(?<!::)`;
    const RIGHT_BOUNDARY = String.raw`(?![\p{L}\p{N}_/\\-])(?!\.[\p{L}\p{N}_-])(?!\()`;
    const magicKeywordRegex = new RegExp(
        `${LEFT_BOUNDARY}(ultrathink|orchestrate|workflowz|jevify)${RIGHT_BOUNDARY}`,
        'giu'
    );
    let magicMatch: RegExpExecArray | null;
    while ((magicMatch = magicKeywordRegex.exec(text)) !== null) {
        const start = magicMatch.index;
        const end = start + magicMatch[0].length;
        if (!nonProseRanges.some(r => start >= r.start && end <= r.end)) {
            const word = magicMatch[0].toLowerCase();
            const className =
                word === 'ultrathink'
                    ? 'bg-gradient-to-r from-red-500 via-pink-500 to-purple-500 bg-clip-text text-transparent font-semibold'
                    : word === 'orchestrate'
                    ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500 bg-clip-text text-transparent font-semibold'
                    : word === 'workflowz'
                    ? 'bg-gradient-to-r from-amber-500 via-lime-500 to-emerald-500 bg-clip-text text-transparent font-semibold'
                    : 'bg-gradient-to-r from-fuchsia-500 via-purple-500 to-amber-500 bg-clip-text text-transparent font-semibold';
            ranges.push({ start, end, style: 'attention', className, priority: 100 });
        }
    }

    const turnBudgetRegex = /(?:^|\s)(\+\d+(?:\.\d+)?(?:[km])?(!)?)(?=\s|$)/gi;
    let budgetMatch: RegExpExecArray | null;
    while ((budgetMatch = turnBudgetRegex.exec(text)) !== null) {
        const token = budgetMatch[1];
        const start = budgetMatch.index + (budgetMatch[0].length - token.length);
        const end = start + token.length;
        if (!nonProseRanges.some(r => start >= r.start && end <= r.end)) {
            ranges.push({
                start,
                end,
                style: 'attention',
                className: 'px-1 py-0.5 rounded text-xs font-mono font-medium bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30',
                priority: 95,
            });
        }
    }

    return ranges;
}
