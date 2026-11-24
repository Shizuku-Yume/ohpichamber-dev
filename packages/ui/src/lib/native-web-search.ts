import { z } from 'zod';
import type { JsonValue } from '@openchamber/agent-contract';

// Native SearchSource/SearchResponse/SearchResultDetails are defined in
// pi-tui/tools/web-search-types and pi-coding-agent/web/search/types.
// The canonical worker preserves { content, details } as ToolResultPart.output.
const source = z.object({
  title: z.string(), url: z.string().url().refine(value => ['https:', 'http:'].includes(new URL(value).protocol)),
  snippet: z.string().optional(), publishedDate: z.string().optional(), ageSeconds: z.number().optional(), author: z.string().optional(),
});
const citation = z.object({ url: source.shape.url, title: z.string(), citedText: z.string().optional() });
const response = z.object({
  provider: z.string().min(1), answer: z.string().optional(), sources: z.array(source), citations: z.array(citation).optional(),
  searchQueries: z.array(z.string()).optional(), relatedQuestions: z.array(z.string()).optional(),
  usage: z.object({ inputTokens: z.number().optional(), outputTokens: z.number().optional(), searchRequests: z.number().optional(), totalTokens: z.number().optional() }).optional(),
  model: z.string().optional(), requestId: z.string().optional(), authMode: z.string().optional(),
});
const failure = z.object({
  provider: z.string(),
  label: z.string(),
  reason: z.string(),
  status: z.number().optional(),
});
const output = z.object({
  content: z.array(z.object({ type: z.literal('text'), text: z.string() })),
  details: z.object({ response, error: z.string().optional(), failures: z.array(failure).optional() }),
});
export type NativeSearchSource = z.infer<typeof source>;
export type NativeSearchOutput = z.infer<typeof output>;
export const parseNativeSearchOutput = (value: JsonValue | undefined): NativeSearchOutput | null => {
  try {
    const parsed = output.safeParse(typeof value === 'string' ? JSON.parse(value) : value);
    return parsed.success ? parsed.data : null;
  } catch { return null; }
};
