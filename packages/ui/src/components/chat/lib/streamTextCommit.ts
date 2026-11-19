<<<<<<< HEAD
// Streaming hold: only a still-growing GFM table row.
//
// OMP holds exactly one thing back while a reply streams: the last line, when
// it is an unfinished table row. A renderer sizes table columns by every row it
// receives, so a half-streamed row (an unclosed link shows its whole URL) would
// rewrap the table on each frame. Everything else — a paragraph, a list item, an
// open code fence — only appends, so it renders as it arrives and the reader
// sees the first token immediately.
//
// The hold keeps the newline before the held line, so the result is a prefix of
// the input and of the result for every append: streaming stays append-only.
||||||| bc50ba56aa
// Block-level streaming reveal.
//
// Token-by-token streaming mutates the trailing paragraph in place on every
// tick: words rewrap, the last line jitters, and the reader's eye fights the
// motion. Text is committed only up to the end of the last finished block, so
// every rendered block is immutable once it appears and the reply lands a
// block at a time: a paragraph, a list item, a closed code fence, a table. A
// block ends at a blank line, at a closing fence, or right before a line that
// starts a list item or a heading. A heading or a bold-only title line is held
// until the block after it is finished too, so a title never shows alone, and
// a line still being written never shows at all.
//
// A block that runs on for a long stretch (a long fence, a paragraph with no
// break) must not stall the stream, so once the held tail outgrows a
// threshold the reveal falls back to complete lines, and inside a long line
// to the last sentence or word boundary.
=======
>>>>>>> upstream/main

// A line holding an unescaped `|`: a GFM table line needs no outer pipes.
const PIPE_IN_LINE_AT = /[^\n]*?(?<!\\)\|/y;
// A whole GFM delimiter row (`| --- | :-: |`, `--- | ---`). Without a leading
// pipe it needs an inner one; a lone `---` is a rule or setext underline.
const DELIMITER_ROW_AT =
    /[ \t>]*(?:\|[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?|[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)+\|?)[ \t]*\r?(?=\n|$)/y;
// A fence line (opener or closer) after any blockquote markers: indentation, marker, info string.
const FENCE_LINE = /^(?:[ \t]*>)*([ \t]*)(`{3,}|~{3,})([^\n]*)$/gm;
// A list item's marker line after any blockquote markers: indentation, marker, spacing.
const LIST_ITEM_LINE = /^(?:[ \t]*>)*([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)\S/;

const matchesAt = (pattern: RegExp, text: string, lineStart: number): boolean => {
    pattern.lastIndex = lineStart;
    return pattern.test(text);
};

/** Column width of leading whitespace, tabs to the next multiple of four. */
const indentWidth = (whitespace: string): number => {
    let width = 0;
    for (const ch of whitespace) width = ch === '\t' ? width + 4 - (width % 4) : width + 1;
    return width;
};

<<<<<<< HEAD
/**
 * Whether the fence line at `lineStart`, indented `indent` columns, is a real
 * fence: at most three columns in, or inside a list item whose content column
 * it sits within three columns of. Deeper lines elsewhere are indented code.
 */
const fenceIndentValid = (text: string, lineStart: number, indent: number): boolean => {
    if (indent <= 3) return true;
    for (let end = lineStart - 1; end > 0;) {
        const start = text.lastIndexOf('\n', end - 1) + 1;
        const line = text.slice(start, end);
        end = start - 1;
        if (!line.trim()) continue;
        const lineIndent = indentWidth(/^(?:[ \t]*>)*([ \t]*)/.exec(line)?.[1] ?? '');
        if (lineIndent >= indent) continue;
        const item = LIST_ITEM_LINE.exec(line);
        if (item) {
            const content = indentWidth(item[1] ?? '') + (item[2]?.length ?? 0) + indentWidth(item[3] ?? '');
            return indent >= content && indent <= content + 3;
||||||| bc50ba56aa
/**
 * Offsets where a finished block ends, in order, counting only complete
 * lines. Each entry also records whether that block is a lone title line.
 */
const findBlockEnds = (text: string): Array<{ end: number; title: boolean }> => {
    const ends: Array<{ end: number; title: boolean }> = [];
    let fence: { char: string; length: number } | null = null;
    let blockLines: string[] = [];
    let start = 0;

    const closeBlock = (end: number) => {
        const content = blockLines.filter((line) => line.trim().length > 0);
        if (content.length > 0) {
            ends.push({ end, title: content.length === 1 && isTitleLine(content[0]) });
        }
        blockLines = [];
    };

    while (start < text.length) {
        const newline = text.indexOf('\n', start);
        if (newline === -1) break;
        const line = text.slice(start, newline);
        const end = newline + 1;
        start = end;

        const marker = FENCE.exec(line)?.[1];
        if (fence) {
            blockLines.push(line);
            if (marker && marker[0] === fence.char && marker.length >= fence.length && line.trim() === marker) {
                fence = null;
                closeBlock(end);
            }
            continue;
        }
        if (marker) {
            fence = { char: marker[0], length: marker.length };
            blockLines.push(line);
            continue;
        }
        if (line.trim().length === 0) {
            closeBlock(end);
            continue;
        }
        blockLines.push(line);
        // The next line starts a new block: the one written so far is done.
        // Its first characters are enough, it need not be finished.
        const nextNewline = text.indexOf('\n', end);
        const next = text.slice(end, nextNewline === -1 ? undefined : nextNewline);
        if (LIST_ITEM_START.test(next) || HEADING.test(next)) {
            closeBlock(end);
=======
const findBlockEnds = (text: string): Array<{ end: number; title: boolean }> => {
    const ends: Array<{ end: number; title: boolean }> = [];
    let fence: { char: string; length: number } | null = null;
    let blockLines: string[] = [];
    let start = 0;

    const closeBlock = (end: number) => {
        const content = blockLines.filter((line) => line.trim().length > 0);
        if (content.length > 0) {
            ends.push({ end, title: content.length === 1 && isTitleLine(content[0]) });
        }
        blockLines = [];
    };

    while (start < text.length) {
        const newline = text.indexOf('\n', start);
        if (newline === -1) break;
        const line = text.slice(start, newline);
        const end = newline + 1;
        start = end;

        const marker = FENCE.exec(line)?.[1];
        if (fence) {
            blockLines.push(line);
            if (marker && marker[0] === fence.char && marker.length >= fence.length && line.trim() === marker) {
                fence = null;
                closeBlock(end);
            }
            continue;
        }
        if (marker) {
            fence = { char: marker[0], length: marker.length };
            blockLines.push(line);
            continue;
        }
        if (line.trim().length === 0) {
            closeBlock(end);
            continue;
        }
        blockLines.push(line);
        const nextNewline = text.indexOf('\n', end);
        const next = text.slice(end, nextNewline === -1 ? undefined : nextNewline);
        if (LIST_ITEM_START.test(next) || HEADING.test(next)) {
            closeBlock(end);
>>>>>>> upstream/main
        }
        // A less indented line that is no list item: only a list item's continuation text keeps looking.
        if (lineIndent === 0) return false;
    }
    return false;
};

<<<<<<< HEAD
/** Whether a code fence is still open at `end` of `text`. */
const fenceOpenAt = (text: string, end: number): boolean => {
    let open: string | undefined;
    FENCE_LINE.lastIndex = 0;
    for (let match = FENCE_LINE.exec(text); match !== null && match.index < end; match = FENCE_LINE.exec(text)) {
        const [, indent = '', marker = '', rest = ''] = match;
        if (!fenceIndentValid(text, match.index, indentWidth(indent))) continue;
        if (open === undefined) {
            // A backtick fence's info string cannot hold a backtick (that line is inline code).
            if (marker[0] !== '`' || !rest.includes('`')) open = marker;
        } else if (marker[0] === open[0] && marker.length >= open.length && rest.trim() === '') {
            open = undefined;
        }
||||||| bc50ba56aa
/** The prefix up to the last complete line, released at a sentence or word inside a long line. */
const commitStreamedLines = (text: string): string => {
    const lastNewline = text.lastIndexOf('\n');
    const committed = lastNewline === -1 ? '' : text.slice(0, lastNewline + 1);
    const held = text.slice(committed.length);

    if (held.length <= LINE_HOLD_MAX_CHARS) {
        return committed;
=======
const commitStreamedLines = (text: string): string => {
    const lastNewline = text.lastIndexOf('\n');
    const committed = lastNewline === -1 ? '' : text.slice(0, lastNewline + 1);
    const held = text.slice(committed.length);

    if (held.length <= LINE_HOLD_MAX_CHARS) {
        return committed;
>>>>>>> upstream/main
    }
<<<<<<< HEAD
    return open !== undefined;
||||||| bc50ba56aa

    let lastSentenceEnd = -1;
    for (const match of held.matchAll(SENTENCE_END)) {
        lastSentenceEnd = match.index + match[0].length;
    }
    if (lastSentenceEnd > 0) {
        return committed + held.slice(0, lastSentenceEnd);
    }

    // No sentence boundary either (a URL, a very long token run): release up
    // to the last word boundary, keeping only the incomplete word held.
    const lastSpace = held.lastIndexOf(' ');
    if (lastSpace > 0) {
        return committed + held.slice(0, lastSpace + 1);
    }

    return text;
=======

    let lastSentenceEnd = -1;
    for (const match of held.matchAll(SENTENCE_END)) {
        lastSentenceEnd = match.index + match[0].length;
    }
    if (lastSentenceEnd > 0) {
        return committed + held.slice(0, lastSentenceEnd);
    }

    const lastSpace = held.lastIndexOf(' ');
    if (lastSpace > 0) {
        return committed + held.slice(0, lastSpace + 1);
    }

    return text;
>>>>>>> upstream/main
};

<<<<<<< HEAD
/**
 * `text` minus a still-growing table row: the unterminated last line when a GFM
 * table (a run of pipe lines holding a header and its delimiter row, outer pipes
 * optional) sits right above it, outside any open code fence. GFM continues a
 * table on any non-blank line, so that line is a row whatever it holds so far.
 * Pass untrimmed source: trimming first drops the newline that marks the last
 * row finished, so that row would be held too.
 */
export const holdPartialTableRow = (text: string): string => {
    const lastBreak = text.lastIndexOf('\n');
    if (lastBreak <= 0 || lastBreak === text.length - 1) return text;
    // Walk up the run of pipe lines above the growing row to a delimiter row with a header above it.
    let lineStart = text.lastIndexOf('\n', lastBreak - 1) + 1;
    let table = false;
    while (matchesAt(PIPE_IN_LINE_AT, text, lineStart)) {
        const above = lineStart > 0 ? text.lastIndexOf('\n', lineStart - 2) + 1 : -1;
        if (matchesAt(DELIMITER_ROW_AT, text, lineStart)) {
            table = above >= 0 && matchesAt(PIPE_IN_LINE_AT, text, above);
            lineStart = above;
            break;
        }
        if (above < 0) break;
        lineStart = above;
||||||| bc50ba56aa
export const commitStreamedText = (text: string): string => {
    if (text.length === 0) return text;

    const ends = findBlockEnds(text);
    let index = ends.length - 1;
    // A title waits for the block it introduces.
    while (index >= 0 && ends[index].title) index -= 1;
    const committed = index >= 0 ? ends[index].end : 0;

    if (text.length - committed <= HOLD_MAX_CHARS) {
        return text.slice(0, committed);
=======
export const commitStreamedText = (text: string): string => {
    if (text.length === 0) return text;

    const ends = findBlockEnds(text);
    let index = ends.length - 1;
    while (index >= 0 && ends[index].title) index -= 1;
    const committed = index >= 0 ? ends[index].end : 0;

    if (text.length - committed <= HOLD_MAX_CHARS) {
        return text.slice(0, committed);
>>>>>>> upstream/main
    }
    if (!table || fenceOpenAt(text, lineStart)) return text;
    return text.slice(0, lastBreak + 1);
};
