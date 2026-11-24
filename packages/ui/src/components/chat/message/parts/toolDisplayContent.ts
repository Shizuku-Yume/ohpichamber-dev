import { toolBaseName } from '@/lib/toolPresentation';
import type { JsonValue } from '@openchamber/agent-contract';
import { z } from 'zod';

const readDisplayContentSchema = z.object({
    text: z.string(),
    startLine: z.number().optional(),
    lineNumbers: z.array(z.number().nullable()).optional(),
});

const displayContentDetailsSchema = z.object({
    displayContent: z.union([z.string(), readDisplayContentSchema]).optional(),
});

export function preferredDisplayContent(details: JsonValue | undefined, fallbackText: string): string {
    if (details === undefined || details === null) return fallbackText;
    const parsed = displayContentDetailsSchema.safeParse(details);
    if (!parsed.success || parsed.data.displayContent === undefined) return fallbackText;

    const stringContent = z.string().safeParse(parsed.data.displayContent).data;
    const text = stringContent ?? readDisplayContentSchema.parse(parsed.data.displayContent).text;
    return text.trim().length > 0 ? text : fallbackText;
}
export const STRUCTURED_CARD_TOOL_NAMES = [
    'debug',
    'github',
    'goal',
    'security_scan',
    'checkpoint',
    'rewind',
    'yield',
    'think',
    'report_issue',
    'resolve',
    'reject',
    'propose',
] as const;

export type StructuredCardToolName = (typeof STRUCTURED_CARD_TOOL_NAMES)[number];

const STRUCTURED_CARD_TOOL_SET: ReadonlySet<string> = new Set(STRUCTURED_CARD_TOOL_NAMES);

export function isStructuredCardTool(toolName: string | undefined): boolean {
    return STRUCTURED_CARD_TOOL_SET.has(toolBaseName(toolName));
}
