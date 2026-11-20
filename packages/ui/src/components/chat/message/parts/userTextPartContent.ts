import type { Root, RootContent } from 'mdast';
import remarkParse from 'remark-parse';
import { defaultRemarkPlugins } from 'streamdown';
import { unified } from 'unified';
import { markdownMath, remarkLiteralText } from '../../markdown/streamdownPlugins';
import type { AgentMentionInfo } from '../types';
import {
    buildAgentHref,
    buildAttachmentHref,
    buildSkillHref,
    type AttachmentCitationLink,
} from '@/lib/messages/inlineMessageLinks';
import { findAttachmentCitationRanges } from '../../attachmentCitations';
import { findSessionLinks, sessionLinkKey } from '@/lib/sessionLinks';
import type { SessionMentionChips } from './sessionMentionChips';

// Skills are named with `$`; messages sent before that used `/`, which history
// still shows as a chip.
export const SKILL_TOKEN_PATTERN = /(^|\s)[$/]([a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)/g;

const FENCED_CODE_SEGMENT_PATTERN = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g;

const escapeHtml = (text: string): string => {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
};

const mapNonFencedSegments = (markdown: string, mapSegment: (segment: string) => string): string => {
    return markdown
        .split(FENCED_CODE_SEGMENT_PATTERN)
        .map((segment, index) => (index % 2 === 1 ? segment : mapSegment(segment)))
        .join('');
};
const mapNonInlineCode = (segment: string, mapSegment: (text: string) => string): string => {
    let output = '';
    let cursor = 0;
    for (const match of segment.matchAll(/(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g)) {
        output += mapSegment(segment.slice(cursor, match.index)) + match[0];
        cursor = match.index + match[0].length;
    }
    return output + mapSegment(segment.slice(cursor));
};


const escapeMarkdownLinkText = (text: string): string => text.replace(/[\\`*_~[\]]/g, '\\$&');

/**
 * Escapes a non-code segment and turns each `[name.png]` citation of one of
 * the message's own attachments into an attachment link, which the Markdown
 * renderer draws as a file chip. Brackets around anything else stay text.
 */
const escapeWithAttachmentCitations = (
    segment: string,
    attachments: ReadonlyArray<AttachmentCitationLink>,
): string => {
    if (attachments.length === 0) return escapeHtml(segment);
    const byName = new Map(attachments.map((attachment) => [attachment.filename.trim().toLowerCase(), attachment]));
    let output = '';
    let cursor = 0;
    for (const range of findAttachmentCitationRanges(segment, [...byName.keys()])) {
        const attachment = byName.get(segment.slice(range.start + 1, range.end - 1).trim().toLowerCase());
        if (!attachment) continue;
        output += escapeHtml(segment.slice(cursor, range.start));
        output += `[${escapeMarkdownLinkText(escapeHtml(attachment.filename))}](${buildAttachmentHref(attachment)})`;
        cursor = range.end;
    }
    return output + escapeHtml(segment.slice(cursor));
};

/**
 * Turns each session or message link the message mentioned into a link
 * labelled with its chip text, which the Markdown renderer draws as the chip
 * (`SessionMentionChipsContext`); everything else goes on to `escapeRest`.
 */
const withSessionMentionLinks = (
    segment: string,
    mentions: { chips: SessionMentionChips; origins: readonly string[] } | undefined,
    escapeRest: (text: string) => string,
): string => {
    if (!mentions || mentions.chips.size === 0) return escapeRest(segment);
    let output = '';
    let cursor = 0;
    for (const range of findSessionLinks(segment, mentions.origins)) {
        const chip = mentions.chips.get(sessionLinkKey(range.target));
        if (!chip) continue;
        // Markdown links already reach MarkdownLink. Convert angle autolinks
        // ourselves because escaping the remaining text would make them literal.
        if (segment.slice(Math.max(0, range.start - 2), range.start) === '](') continue;
        const angleLink = segment[range.start - 1] === '<' && segment[range.end] === '>';
        output += escapeRest(segment.slice(cursor, angleLink ? range.start - 1 : range.start));
        const destination = range.link.replace(/[\\<>]/g, (char) => encodeURIComponent(char));
        output += `[${escapeMarkdownLinkText(escapeHtml(chip.label))}](<${destination}>)`;
        cursor = range.end + (angleLink ? 1 : 0);
    }
    return output + escapeRest(segment.slice(cursor));
};

// In Markdown a single "\n" is a soft break (rendered as a space). Users type plain
// text where each newline is meant literally, so convert soft breaks into hard breaks
// (two trailing spaces) outside of fenced code blocks, where newlines are already literal.
const applyHardLineBreaks = (markdown: string): string => {
    return mapNonFencedSegments(markdown, (segment) => segment.replace(/ *\n/g, '  \n'));
};

// A message that is only "+", "-" or "*" parses as an empty list item, which shows
// a bare marker dot instead of the sign the user typed.
const LONE_LIST_MARKER_PATTERN = /^\s*([+*-])\s*$/;

const literalSourceParser = unified().use(remarkParse).use(remarkLiteralText).use([defaultRemarkPlugins.gfm, markdownMath.remarkPlugin]);
const LITERAL_SOURCE_NODES: ReadonlySet<string> = new Set(['code', 'inlineCode', 'math', 'inlineMath', 'image', 'definition']);

const literalSourceRanges = (markdown: string): Array<[number, number]> => {
    const ranges: Array<[number, number]> = [];
    const walk = (node: Root | RootContent): void => {
        const start = node.position?.start.offset;
        const end = node.position?.end.offset;
        if (start === undefined || end === undefined) return;
        if (LITERAL_SOURCE_NODES.has(node.type) || (node.type === 'link' && markdown[start] !== '[')) {
            ranges.push([start, end]);
            return;
        }
        if ('children' in node) node.children.forEach(walk);
        if (node.type === 'link') ranges.push([node.children.at(-1)?.position?.end.offset ?? start + 1, end]);
    };
    walk(literalSourceParser.parse(markdown));
    return ranges;
};

const doubleBackslashRuns = (text: string): string => text.replace(/\\+(?=[.?])/g, (run) => run + run);

const escapeBackslashesBeforePunctuation = (text: string): string => {
    if (!/\\[.?]/.test(text)) return text;
    let output = '';
    let cursor = 0;
    for (const [start, end] of literalSourceRanges(text)) {
        output += doubleBackslashRuns(text.slice(cursor, start)) + text.slice(start, end);
        cursor = end;
    }
    return output + doubleBackslashRuns(text.slice(cursor));
};

export const prepareUserMarkdownContent = ({
    textContent,
    agentMention,
    skillNames,
    attachments = [],
    sessionMentions,
}: {
    textContent: string;
    agentMention?: AgentMentionInfo;
    skillNames: ReadonlySet<string>;
    attachments?: ReadonlyArray<AttachmentCitationLink>;
    /** The message's mentioned sessions and messages, and this instance's web addresses their links point at. */
    sessionMentions?: { chips: SessionMentionChips; origins: readonly string[] };
}): string => {
    const loneListMarker = LONE_LIST_MARKER_PATTERN.exec(textContent);
    if (loneListMarker) return `\\${loneListMarker[1]}`;

    let content = mapNonFencedSegments(escapeBackslashesBeforePunctuation(textContent), (segment) => mapNonInlineCode(segment, (part) => withSessionMentionLinks(
        part,
        sessionMentions,
        (rest) => escapeWithAttachmentCitations(rest, attachments),
    )));

    // Insert agent mention links with an internal href so markdown renders them as mentions, not external links.
    if (agentMention?.token && content.includes(agentMention.token)) {
        const mentionMarkdown = `[${agentMention.token}](${buildAgentHref(agentMention.name)})`;
        content = content.replace(agentMention.token, mentionMarkdown);
    }

    content = content.replace(SKILL_TOKEN_PATTERN, (match, prefix: string, skillName: string) => {
        if (!skillNames.has(skillName)) return match;
        return `${prefix}[/${skillName}](${buildSkillHref(skillName)})`;
    });

    // Preserve user newlines (markdown soft breaks would otherwise collapse to spaces)
    return applyHardLineBreaks(content);
};
