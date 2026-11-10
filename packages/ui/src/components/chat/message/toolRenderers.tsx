import type { JsonValue, ToolResultPart } from '@openchamber/agent-contract';
import { z } from 'zod';

import type { I18nKey, I18nParams } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { typography } from '@/lib/typography';
import { SimpleMarkdownRenderer } from '../MarkdownRenderer';
import { parseNativeSearchOutput } from '@/lib/native-web-search';
import { WebSearchResults } from './parts/WebSearchResults';


export const coerceToText = (value: unknown, fallback = ''): string => {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
    try {
        return JSON.stringify(value);
    } catch {
        return fallback;
    }
};

/** SDK result envelopes are retained verbatim by the canonical projection. */
export const nativeToolResultContent = (result: ToolResultPart | undefined): {
    text: string;
    images: Array<{ mediaType: string; data: string }>;
    details?: JsonValue;
} => {
    const output = result?.output;
    if (output === null) return { text: 'null', images: [] };
    if (!output || typeof output !== 'object' || Array.isArray(output) || !Array.isArray(output.content)) {
        // A result made of text content blocks is one string to the reader, not
        // JSON: joining the blocks keeps a tool card from showing raw envelopes.
        const textBlocks = output === undefined ? null : unwrapTextBlocks(output);
        return { text: textBlocks ?? coerceToText(output), images: [] };
    }
    const text: string[] = [];
    const images: Array<{ mediaType: string; data: string }> = [];
    for (const block of output.content) {
        if (block && typeof block === 'object' && !Array.isArray(block)) {
            if (block.type === 'text' && typeof block.text === 'string') {
                text.push(block.text);
                continue;
            }
            if (block.type === 'image' && typeof block.data === 'string' && typeof block.mimeType === 'string'
                && ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(block.mimeType)
                && block.data.length <= 14 * 1024 * 1024) {
                images.push({ mediaType: block.mimeType, data: block.data });
                continue;
            }
        }
        // Unrecognized content is still inspectable rather than silently discarded.
        text.push(coerceToText(block));
    }
    return { text: text.join('\n'), images, details: output.details };
};

// Guards the renderer process against V8 "Zone Allocation failed" OOM crashes
// (issue #2265). When a tool returns oversized external content — e.g. a fetched
// web page with full-resolution base64 images inlined — the entire payload flows
// through this module as a single JS string that is JSON.parsed, syntax
// highlighted, and attached to the DOM. A large enough single string exceeds
// V8's Zone allocator and hard-crashes the renderer before any virtualization or
// CSS clip can help. Capping the string length before that work happens keeps a
// useful head of the output while preventing the pathological allocation.
export const TOOL_OUTPUT_MAX_CHARS = 512 * 1024;

export const capToolOutputText = (
    output: string,
    maxChars: number = TOOL_OUTPUT_MAX_CHARS,
): string => {
    if (typeof output !== 'string' || output.length <= maxChars) {
        return output;
    }
    const omitted = output.length - maxChars;
    const notice = `\n\n… [output truncated: ${omitted} more characters not shown to prevent the renderer from running out of memory]`;
    return output.slice(0, maxChars) + notice;
};


export const tryParseJsonOutput = (output: string): { data: JsonValue; isJson: boolean } => {
    if (!output || typeof output !== 'string') {
        return { data: null, isJson: false };
    }

    const trimmed = output.trim();

    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return { data: null, isJson: false };
    }

    if (!trimmed.endsWith('}') && !trimmed.endsWith(']')) {
        return { data: null, isJson: false };
    }

    if (trimmed.length < 2) {
        return { data: null, isJson: false };
    }

    try {
        const parsed: JsonValue = JSON.parse(trimmed);
        if (parsed !== null && typeof parsed === 'object') {
            return { data: parsed, isJson: true };
        }
        return { data: null, isJson: false };
    } catch {
        return { data: null, isJson: false };
    }
};

const TEXT_BLOCK_UNWRAP_PASSES = 4;
const textBlockSchema = z.object({ type: z.literal('text'), text: z.string() });
type TextBlock = z.infer<typeof textBlockSchema>;

// The content-block envelope, a single block or a list of them, validated one
// block at a time so the first non-text entry stops the parse (a whole-array
// schema instead accumulates an error per entry, which stalls on large
// structured results such as a serialized numeric array).
const parseTextBlocks = (value: JsonValue): TextBlock[] | null => {
    const blocks = Array.isArray(value) ? value : [value];
    if (blocks.length === 0) return null;
    const parsed: TextBlock[] = [];
    for (const block of blocks) {
        const result = textBlockSchema.safeParse(block);
        if (!result.success) return null;
        parsed.push(result.data);
    }
    return parsed;
};

const looksLikeJsonContainer = (text: string): boolean => {
    const trimmed = text.trim();
    return (trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'));
};

/**
 * The text of a tool result made of text content blocks, joined on newlines.
 * A finished tool call may carry its result as `[{type:"text",text}]`, and the
 * transport may serialize that list once more, so the joined text is unwrapped
 * again while it is itself such a list, four passes at most (upstream #5067).
 * Any other result returns null.
 */
export const unwrapTextBlocks = (data: JsonValue): string | null => {
    let blocks = parseTextBlocks(data);
    if (!blocks) return null;

    let text = '';
    for (let pass = 0; pass < TEXT_BLOCK_UNWRAP_PASSES; pass += 1) {
        let joined = '';
        for (const block of blocks) {
            joined += (joined ? '\n' : '') + block.text;
        }
        text = joined;

        if (!looksLikeJsonContainer(joined)) break;
        let parsed: JsonValue;
        try {
            parsed = JSON.parse(joined);
        } catch {
            break;
        }
        const inner = parseTextBlocks(parsed);
        if (!inner) break;
        blocks = inner;
    }
    return text;
};

const GREP_DOT_STYLE = { backgroundColor: 'var(--status-info)', opacity: 0.6 };

/** Non-React renderers receive the component's translator; count-dependent
 *  copy resolves complete singular/plural messages instead of a suffix. */
type ToolRendererTranslate = (key: I18nKey, params?: I18nParams) => string;

export const renderGrepOutput = (output: string, isMobile: boolean, t: ToolRendererTranslate, options?: { unstyled?: boolean }) => {
    try {
        const lines = output.trim().split('\n').filter(Boolean);
        if (lines.length === 0) return null;

        const fileGroups: Record<string, Array<{ lineNum: string; content: string }>> = {};

        lines.forEach((line) => {
            const match = line.match(/^(.+?):(\d+):(.*)$/) || line.match(/^(.+?):(.*)$/);
            if (match) {
                const [, filepath, lineNumOrContent, content] = match;
                const lineNum = content !== undefined ? lineNumOrContent : '';
                const actualContent = content !== undefined ? content : lineNumOrContent;

                if (!fileGroups[filepath]) {
                    fileGroups[filepath] = [];
                }
                fileGroups[filepath].push({ lineNum, content: actualContent });
            }
        });

        return (
            <div
                className={cn(
                    'space-y-2 w-full min-w-0',
                    options?.unstyled ? null : 'p-3 bg-muted/20 rounded-xl border border-border/30'
                )}
                style={typography.tool.popup}
            >
                <div className="typography-meta text-muted-foreground mb-2">
                    {lines.length === 1
                        ? t('chat.toolPart.grepMatchesFoundSingle', { count: lines.length })
                        : t('chat.toolPart.grepMatchesFoundPlural', { count: lines.length })}
                </div>
                {Object.entries(fileGroups).map(([filepath, matches]) => (
                    <div key={filepath} className="space-y-1">
                        <div className={cn('font-medium text-muted-foreground', isMobile ? 'typography-micro' : 'typography-code')}>
                            {filepath}
                        </div>
                        <div className="ps-4 space-y-1">
                            {matches.map((match, idx) => {
                                if (!match.lineNum && !match.content) {
                                    return null;
                                }
                                return (
                                    <div key={idx} className={cn('flex items-start gap-2 min-w-0', isMobile ? 'typography-micro' : 'typography-code')}>
                                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={GREP_DOT_STYLE} />
                                        <div className="flex gap-2 min-w-0 flex-1">
                                            {match.lineNum && (
                                                <span className="text-muted-foreground font-mono whitespace-nowrap">
                                                    Line {match.lineNum}:
                                                </span>
                                            )}
                                            <span className="text-foreground font-mono break-words flex-1">
                                                {match.content || '\u00A0'}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        );

    } catch {
        return null;
    }
};

const GLOB_DOT_STYLE = { backgroundColor: 'var(--status-info)', opacity: 0.6 };

export const renderGlobOutput = (output: string, isMobile: boolean, t: ToolRendererTranslate, options?: { unstyled?: boolean }) => {
    try {
        const paths = output.trim().split('\n').filter(Boolean);
        if (paths.length === 0) return null;

        const groups: Record<string, string[]> = {};
        paths.forEach((path) => {
            const lastSlash = path.lastIndexOf('/');
            const dir = lastSlash > 0 ? path.substring(0, lastSlash) : '/';
            const filename = lastSlash >= 0 ? path.substring(lastSlash + 1) : path;

            if (!groups[dir]) {
                groups[dir] = [];
            }
            groups[dir].push(filename);
        });

        const sortedDirs = Object.keys(groups).sort();

        return (
            <div
                className={cn(
                    'space-y-2 w-full min-w-0',
                    options?.unstyled ? null : 'p-3 bg-muted/20 rounded-xl border border-border/30'
                )}
                style={typography.tool.popup}
            >
                <div className="typography-meta text-muted-foreground mb-2">
                    {paths.length === 1
                        ? t('chat.toolPart.globFilesFoundSingle', { count: paths.length })
                        : t('chat.toolPart.globFilesFoundPlural', { count: paths.length })}
                </div>
                {sortedDirs.map((dir) => (
                    <div key={dir} className="space-y-1">
                        <div className={cn('font-medium text-muted-foreground', isMobile ? 'typography-micro' : 'typography-code')}>
                            {dir}/
                        </div>
                        <div className={cn('ps-4 grid gap-1', isMobile ? 'grid-cols-1' : 'grid-cols-2')}>
                            {groups[dir].sort().map((filename) => (
                                <div key={filename} className={cn('flex items-center gap-2 min-w-0', isMobile ? 'typography-micro' : 'typography-code')}>
                                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={GLOB_DOT_STYLE} />
                                    <span className="text-foreground font-mono truncate">{filename}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    } catch {
        return null;
    }
};

export const renderWebSearchOutput = (output: JsonValue | undefined, options?: { unstyled?: boolean }) => {
    try {
        const parsed = parseNativeSearchOutput(output);
        if (parsed) {
            return (
                <div className={cn('w-full min-w-0', options?.unstyled ? null : 'p-2 bg-muted/20 rounded-xl border border-border/20')}>
                    <WebSearchResults output={parsed} />
                </div>
            );
        }
        return (
            <div
                className={cn(
                    'typography-code max-w-none w-full min-w-0',
                    options?.unstyled ? null : 'p-3 bg-muted/20 rounded-xl border border-border/20'
                )}
                style={typography.tool.popup}
            >
<<<<<<< HEAD
                <SimpleMarkdownRenderer content={coerceToText(output)} variant="tool" />
=======
                <SimpleMarkdownRenderer content={output} singleTilde={false} variant="tool" />
>>>>>>> bc50ba56a
            </div>
        );
    } catch {
        return null;
    }
};

type DiffLineType = 'context' | 'added' | 'removed';

interface UnifiedDiffLine {
    type: DiffLineType;
    lineNumber: number | null;
    content: string;
}

interface UnifiedDiffHunk {
    file: string;
    oldStart: number;
    newStart: number;
    lines: UnifiedDiffLine[];
}

export const parseDiffToUnified = (diffText: string): UnifiedDiffHunk[] => {
    const lines = diffText.split('\n');
    let currentFile = '';
    const hunks: UnifiedDiffHunk[] = [];

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];

        if (line.startsWith('Index:') || line.startsWith('===') || line.startsWith('---') || line.startsWith('+++')) {
            if (line.startsWith('Index:')) {
                currentFile = line.slice('Index:'.length).trim().split('/').pop() || 'file';
            }
            i++;
            continue;
        }

        if (line.startsWith('@@')) {
            const match = line.match(/@@ -(\d+),\d+ \+(\d+),\d+ @@/);
            const oldStart = match ? parseInt(match[1]) : 0;
            const newStart = match ? parseInt(match[2]) : 0;

            const unifiedLines: UnifiedDiffLine[] = [];
            let oldLineNum = oldStart;
            let newLineNum = newStart;
            let j = i + 1;

            while (j < lines.length && !lines[j].startsWith('@@') && !lines[j].startsWith('Index:')) {
                const contentLine = lines[j];
                if (contentLine.startsWith('+')) {
                    unifiedLines.push({ type: 'added', lineNumber: newLineNum, content: contentLine.substring(1) });
                    newLineNum++;
                } else if (contentLine.startsWith('-')) {
                    unifiedLines.push({ type: 'removed', lineNumber: oldLineNum, content: contentLine.substring(1) });
                    oldLineNum++;
                } else if (contentLine.startsWith(' ')) {
                    unifiedLines.push({ type: 'context', lineNumber: newLineNum, content: contentLine.substring(1) });
                    oldLineNum++;
                    newLineNum++;
                }
                j++;
            }

            hunks.push({
                file: currentFile,
                oldStart,
                newStart,
                lines: unifiedLines,
            });

            i = j;
            continue;
        }

        i++;
    }

    return hunks;
};
