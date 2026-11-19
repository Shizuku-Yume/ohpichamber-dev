
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

export type ComposerChipTarget =
    | { kind: 'attachment'; filename: string }
    | { kind: 'path'; path: string }
    | { kind: 'link'; url: string };

export interface ComposerLanguageContext {
    inputMode: 'normal' | 'shell';
    knownAgentNames: ReadonlySet<string>;
    confirmedMentions: ReadonlySet<string>;
    confirmedMentionsRevision?: number;
    mentionDismissal?: { dismiss: (name: string) => void; hint: string };
    knownSlashNames: ReadonlySet<string>;
<<<<<<< HEAD
    /** Native prompt template names invocable with a leading `/`. */
||||||| bc50ba56aa
    /** Lowercased snippet names and aliases invocable with `#`. */
=======
>>>>>>> upstream/main
    knownSnippetTriggers: ReadonlySet<string>;
    attachmentFilenames: readonly string[];
    pendingAttachmentFilenames?: ReadonlySet<string>;
    missingAttachments?: { names: readonly string[]; title: string };
    onChipOpen?: (target: ComposerChipTarget) => void;
    knownSkillNames?: ReadonlySet<string>;
    fileIconVariant?: 'light' | 'dark';
<<<<<<< HEAD
    /**
     * The session or message each `[[…]]` link mention resolves to, keyed by
     * `sessionLinkKey`; without it a resolved link stays plain text.
     */
||||||| bc50ba56aa
    /**
     * Session and message links the composer has resolved, by `sessionLinkKey`:
     * each draws as a chip with its session's title or the start of its message.
     * A link not resolved (yet) stays text.
     */
=======
>>>>>>> upstream/main
    sessionLinkChips?: ReadonlyMap<string, { label: string; title: string; iconHref: string }>;
<<<<<<< HEAD
    /** Link origins the mention syntax accepts; the app's own when absent. */
||||||| bc50ba56aa
    /** This instance's web addresses, which a web session link must point at (`parseSessionLink`). */
=======
>>>>>>> upstream/main
    sessionLinkOrigins?: readonly string[];
<<<<<<< HEAD
||||||| bc50ba56aa
    /** Links to issues, change requests and tracker items the composer has read, by the link as written; each draws as a chip. */
    referenceLinkChips?: ReadonlyMap<string, { label: string; title: string; iconHref: string }>;
=======
    referenceLinkChips?: ReadonlyMap<string, { label: string; title: string; iconHref: string }>;
>>>>>>> upstream/main
}

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

export function tokenizeComposer(
    text: string,
    context: ComposerLanguageContext,
): HighlightRange[] {
    if (!text || context.inputMode === 'shell') return [];

    const ranges: HighlightRange[] = [
        ...tokenizeMarkdown(text),
        ...highlightFencedCode(text),
        ...mentionRangesToHighlightRanges(tokenizeMentions(text, context)),
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
                    ? 'text-[var(--status-error)] font-semibold'
                    : word === 'orchestrate'
                        ? 'text-[var(--status-success)] font-semibold'
                        : word === 'workflowz'
                            ? 'text-[var(--status-warning)] font-semibold'
                            : 'text-[var(--primary-base)] font-semibold';
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
                className: 'px-1 py-0.5 rounded text-xs font-mono font-medium bg-[var(--status-warning-background)] text-[var(--status-warning-text)] border border-[var(--status-warning-border)]',
                priority: 95,
            });
        }
    }

    return ranges;
}
