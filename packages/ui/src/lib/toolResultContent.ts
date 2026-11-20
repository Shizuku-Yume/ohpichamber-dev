import type { JsonValue, ToolResultPart } from '@openchamber/agent-contract';
import { z } from 'zod';

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

const TEXT_BLOCK_UNWRAP_PASSES = 4;
const textBlockSchema = z.object({ type: z.literal('text'), text: z.string() });
type TextBlock = z.infer<typeof textBlockSchema>;

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

// external: #5067 OpenCode text-content results can be serialized in nested envelopes; unwrapping is bounded.
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
