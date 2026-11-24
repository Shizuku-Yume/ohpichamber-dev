import type { Message, SessionRuntimeStatus, Subagent, ToolCallPart } from '@openchamber/agent-contract';
import type { I18nKey, I18nParams, Locale } from '@/lib/i18n';
import { formatRetryCountdown } from '@/lib/retryCountdown';
import { describeToolCall, isReadTool, isShellTool, isWriteTool, isEditTool, toolPresentation } from '@/lib/toolPresentation';

export const SUBAGENT_SILENCE_MS = 90_000;

type ToolCall = { tool: string | null; detail: string | null };

export type SubagentActivity =
  | { kind: 'retry'; attempt: number | null; at: number | null; error: string | null }
  | ({ kind: 'tool'; since: number | null } & ToolCall)
  | { kind: 'thinking' }
  | { kind: 'writing' }
  | { kind: 'waiting'; since: number; last: ToolCall | null };

const baseName = (path: string): string => {
  const trimmed = path.replace(/[\\/]+$/, '');
  const index = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return index >= 0 ? trimmed.slice(index + 1) : trimmed;
};

const callsByPart = new WeakMap<ToolCallPart, ToolCall>();

const describeTool = (part: ToolCallPart): ToolCall => {
  const cached = callsByPart.get(part);
  if (cached) return cached;
  const description = describeToolCall(part.input, part.toolName);
  const detail = description && (isReadTool(part.toolName) || isWriteTool(part.toolName) || isEditTool(part.toolName))
    ? baseName(description) : description?.split('\n')[0] ?? null;
  const call = isShellTool(part.toolName) && detail ? { tool: null, detail } : { tool: toolPresentation(part.toolName).label, detail };
  callsByPart.set(part, call);
  return call;
};

export const toolCallText = (call: ToolCall): string => [call.tool, call.detail].filter(Boolean).join(' ');

export const lastConversationMessage = (messages: readonly Message[] | undefined): Message | undefined => {
  if (!messages) return undefined;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'assistant' || message.role === 'user') return message;
  }
  return undefined;
};

export const readSubagentActivity = (
  messages: readonly Message[] | undefined,
  status: SessionRuntimeStatus | undefined,
  activeTurnIds: ReadonlySet<string>,
): SubagentActivity | null => {
  if (status !== 'running' && status !== 'awaiting_approval' && status !== 'awaiting_input') return null;
  if (!messages || messages.length === 0) return null;

  const latest = lastConversationMessage(messages);
  if (!latest || !activeTurnIds.has(latest.turnId)) return null;
  if (latest.role !== 'assistant') {
    return { kind: 'waiting', since: latest.createdAt, last: null };
  }

  const parts = latest.parts;
  const tail = parts.at(-1);
  if (tail?.type === 'notice' && tail.noticeType === 'auto_retry_start') {
    return { kind: 'retry', attempt: tail.details.attempt, at: null, error: tail.details.errorMessage || null };
  }
  const results = new Set(parts.filter(part => part.type === 'tool_result').map(part => `${part.toolCallId}\0${part.toolName}`));
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (part.type !== 'tool_call' || results.has(`${part.toolCallId}\0${part.toolName}`)) continue;
    if (part.status === 'running' || part.status === 'pending_approval' || part.status === 'approved') {
      return { kind: 'tool', ...describeTool(part), since: null };
    }
  }

  if (latest.timing?.completedAt === undefined && status === 'running') {
    if (tail?.type === 'reasoning') return { kind: 'thinking' };
    if (tail?.type === 'text') return { kind: 'writing' };
  }
  const since = latest.timing?.completedAt ?? latest.createdAt;
  return { kind: 'waiting', since, last: findLastTool(messages, latest.turnId) };
};

const LAST_TOOL_LOOKBACK = 4;

const findLastTool = (
  messages: readonly Message[],
  turnId: string,
): ToolCall | null => {
  let steps = 0;
  for (let index = messages.length - 1; index >= 0 && steps < LAST_TOOL_LOOKBACK; index -= 1) {
    const message = messages[index];
    if (message.turnId !== turnId) break;
    if (message.role === 'user') break;
    if (message.role !== 'assistant') continue;
    steps += 1;
    const parts = message.parts;
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = parts[partIndex];
      if (part.type === 'tool_call') return describeTool(part);
    }
  }
  return null;
};

export const subagentAlertInputs = (activity: SubagentActivity | null): SubagentActivity | null => {
  if (activity?.kind === 'retry') return activity;
  if (activity?.kind === 'waiting') return { kind: 'waiting', since: activity.since, last: null };
  return null;
};

export const encodeSubagentActivity = (activity: SubagentActivity | null): string => (activity ? JSON.stringify(activity) : '');

export const decodeSubagentActivity = (encoded: string): SubagentActivity | null => {
  if (!encoded) return null;
  const activity: SubagentActivity = JSON.parse(encoded);
  return activity;
};

const REPORT_LINE_MAX = 200;

const plainLines = (output: string): string[] => output.split('\n').flatMap((raw) => {
  const trimmed = raw.trim();
  if (/^(?:-{3,}|\*{3,}|_{3,}|```.*|~~~.*)$/.test(trimmed)) return [];
  const line = trimmed
    .replace(/^#{1,6}\s+/, '')
    .replace(/^(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/^>\s*/, '')
    .replace(/(\*\*|__|`)/g, '')
    .trim();
  return line ? [line] : [];
});

export const reportFirstLine = (output: string): string | null => {
  const [first, second] = plainLines(output);
  if (!first) return null;
  const line = first.endsWith(':') && second ? `${first} ${second}` : first;
  return line.length > REPORT_LINE_MAX ? `${line.slice(0, REPORT_LINE_MAX)}…` : line;
};

type SubagentTranslate = (key: I18nKey, params?: I18nParams) => string;

type SubagentLiveDetailText = { text: string; tone: 'muted' | 'warning' } | null;

/**
 * Live detail for a row that has a Canonical `Subagent` record but no hydrated
 * child transcript: the record's own `activeTool`/`lastIntent`/`retryCountdown`
 * describe the live step until the child session's messages catch up.
 */
export const formatSubagentLiveDetail = (
  subagent: Subagent | undefined,
  alertsOnly: boolean | undefined,
  t: SubagentTranslate,
  locale: Locale,
): SubagentLiveDetailText => {
  if (!subagent) return null;
  if (subagent.retryCountdown !== undefined && subagent.retryCountdown > 0) {
    const countdown = formatRetryCountdown(Math.ceil(subagent.retryCountdown), locale);
    return { text: t('chat.agentStatus.retry.in', { time: countdown }), tone: 'warning' };
  }
  if (alertsOnly) return null;
  const tool = subagent.activeTool?.trim();
  const args = subagent.activeToolArgs?.trim();
  if (tool) {
    const detail = args ? `${tool} ${args}` : tool;
    return { text: detail, tone: 'muted' };
  }
  const intent = subagent.lastIntent?.trim() || subagent.stage?.trim();
  if (intent) return { text: intent, tone: 'muted' };
  return null;
};
