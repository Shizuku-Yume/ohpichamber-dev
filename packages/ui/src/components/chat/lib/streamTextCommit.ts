
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
        }
        // A less indented line that is no list item: only a list item's continuation text keeps looking.
        if (lineIndent === 0) return false;
    }
    return false;
};

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
    }
    return open !== undefined;
};

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
    }
    if (!table || fenceOpenAt(text, lineStart)) return text;
    return text.slice(0, lastBreak + 1);
};
