import { z } from 'zod';

/**
 * The report of a workflow run, as the session that proposed it sees it.
 *
 * When a run ends the OpenChamber server
 * (`web/server/lib/workflows/runtime.js`) appends one synthetic message to the
 * session, the way a dispatched session reports back: the text wraps the report
 * in an `<openchamber-workflow …>` envelope that names the run and its state.
 */

type WorkflowReportState = 'completed' | 'failed' | 'stopped' | 'declined';

export type WorkflowReport = {
  runId: string;
  name: string;
  state: WorkflowReportState;
  /** The report without the envelope. */
  output: string;
};

const ENVELOPE = /^\s*<openchamber-workflow\b([^>]*)>\n?([\s\S]*?)\n?<\/openchamber-workflow>\s*$/;
const ATTRIBUTE = /([a-zA-Z]+)="([^"]*)"/g;

/** The report's attributes, as the runtime writes them. */
const attributesOf = (source: string): Record<string, string> => {
  const attributes: Record<string, string> = {};
  for (const match of source.matchAll(ATTRIBUTE)) attributes[match[1]] = match[2];
  return attributes;
};

/** The text of a canonical message: its text parts, in order. */
const textOf = (message: WorkflowReportMessage): string => Array.isArray(message.parts)
  ? message.parts.filter((part) => part?.type === 'text' && typeof part.content === 'string').map((part) => part.content).join('')
  : '';

/**
 * A canonical message as the report reader needs it. The workflow report
 * arrives as a synthetic user message, so the caller decides whether to look
 * at it; the envelope carries every field.
 */
export type WorkflowReportMessage = {
  role: string;
  parts?: ReadonlyArray<{ type: string; content?: string }>;
};

/** The workflow run a message reports on, or undefined for any other message. */
export function readWorkflowReport(message: WorkflowReportMessage): WorkflowReport | undefined {
  const text = textOf(message);
  const envelope = text.match(ENVELOPE);
  if (!envelope) return undefined;
  const attributes = attributesOf(envelope[1]);
  // The tag itself names the source; the attributes name the run.
  const parsed = z.object({
    runId: z.string().min(1),
    name: z.string(),
    state: z.enum(['completed', 'failed', 'stopped', 'declined']),
  }).safeParse(attributes);
  if (!parsed.success) return undefined;
  return {
    runId: parsed.data.runId,
    name: parsed.data.name,
    state: parsed.data.state,
    output: envelope[2],
  };
}
