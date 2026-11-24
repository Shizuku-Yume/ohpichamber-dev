import { describe, expect, test } from 'bun:test';
import { AsyncJobResultNoticePartSchema, AttachmentPartSchema, MessageSchema, NoticePartSchema, PartSchema, ReasoningPartSchema, StepSummaryPartSchema, TextPartSchema, TokenUsageSchema, ToolCallPartSchema, ToolResultPartSchema, ToolStatusSchema, TurnSchema, TurnStatusSchema } from './messages.ts';
const turn = {
  turnId: 'turn-1',
  sessionId: 'session-1',
  runId: 'run-1',
  status: 'running',
  userMessageId: 'message-user',
  assistantMessageIds: ['message-assistant'],
  startedAt: 1,
};

const textPart = { type: 'text', partId: 'part-text', content: 'hello' };
const reasoningPart = { type: 'reasoning', partId: 'part-reasoning', content: 'thinking', signature: 'sig-1' };
const toolCallPart = {
  type: 'tool_call',
  partId: 'part-call',
  toolCallId: 'call-1',
  toolName: 'bash',
  input: { command: 'ls', args: ['-la'], options: { hidden: false } },
  status: 'running',
  approvalId: 'approval-1',
};
const toolResultPart = {
  type: 'tool_result',
  partId: 'part-result',
  toolCallId: 'call-1',
  toolName: 'bash',
  output: { files: ['README.md'], count: 1 },
  isError: false,
};
const attachmentPart = {
  type: 'attachment',
  partId: 'part-attachment',
  attachmentId: 'attachment-1',
  name: 'notes.txt',
  mediaType: 'text/plain',
  size: 12,
  uri: 'attachment://attachment-1',
};
const stepSummaryPart = { type: 'step_summary', partId: 'part-summary', title: 'List files', durationMs: 2 };

describe('message wire schemas', () => {
  test('round-trips every turn and tool status value', () => {
    for (const status of ['pending', 'running', 'awaiting_approval', 'awaiting_input', 'completed', 'failed', 'cancelled'] as const) {
      expect(TurnStatusSchema.parse(status)).toBe(status);
    }
    for (const status of ['pending_approval', 'approved', 'running', 'completed', 'failed', 'denied', 'cancelled'] as const) {
      expect(ToolStatusSchema.parse(status)).toBe(status);
    }
    expect(() => TurnStatusSchema.parse('paused')).toThrow();
    expect(() => ToolStatusSchema.parse('queued')).toThrow();
  });

  test('round-trips the turn and preserves its inner run identity', () => {
    expect(TurnSchema.parse(turn)).toEqual(turn);
    expect(TurnSchema.parse(turn).runId).toBe('run-1');
    expect(TurnSchema.safeParse({ ...turn, runId: undefined }).success).toBe(false);
  });

  test('round-trips all six part variants with their concrete payloads', () => {
    expect(TextPartSchema.parse(textPart)).toEqual(textPart);
    expect(ReasoningPartSchema.parse(reasoningPart)).toEqual(reasoningPart);
    expect(ToolCallPartSchema.parse(toolCallPart)).toEqual(toolCallPart);
    expect(ToolResultPartSchema.parse(toolResultPart)).toEqual(toolResultPart);
    expect(AttachmentPartSchema.parse(attachmentPart)).toEqual(attachmentPart);
    expect(StepSummaryPartSchema.parse(stepSummaryPart)).toEqual(stepSummaryPart);

    expect(PartSchema.parse(textPart)).toEqual(textPart);
    expect(PartSchema.parse(reasoningPart)).toEqual(reasoningPart);
    expect(PartSchema.parse(toolCallPart)).toEqual(toolCallPart);
    expect(PartSchema.parse(toolResultPart)).toEqual(toolResultPart);
    expect(PartSchema.parse(attachmentPart)).toEqual(attachmentPart);
    expect(PartSchema.parse(stepSummaryPart)).toEqual(stepSummaryPart);
  });

  test('rejects malformed tool JSON, attachment URIs, and tool status fields', () => {
    expect(() => ToolCallPartSchema.parse({ ...toolCallPart, input: { command: undefined } })).toThrow();
    expect(() => ToolResultPartSchema.parse({ ...toolResultPart, output: { files: undefined } })).toThrow();
    expect(() => AttachmentPartSchema.parse({ ...attachmentPart, uri: 'attachment://other' })).toThrow();
    expect(() => ToolResultPartSchema.parse({ ...toolResultPart, status: 'completed' })).toThrow();
    expect(() => PartSchema.parse({ ...textPart, type: 'unknown' })).toThrow();
    expect(() => TextPartSchema.parse({ ...textPart, content: 42 })).toThrow();
    expect(() => ReasoningPartSchema.parse({ ...reasoningPart, signature: 42 })).toThrow();
    expect(() => StepSummaryPartSchema.parse({ ...stepSummaryPart, durationMs: -1 })).toThrow();
  });

  test('round-trips message identity and rejects an unknown role', () => {
    const message = {
      messageId: 'message-1',
      sessionId: 'session-1',
      turnId: 'turn-1',
      role: 'assistant',
      createdAt: 2,
      parts: [textPart, toolCallPart, toolResultPart],
    };
    expect(MessageSchema.parse(message)).toEqual(message);
    expect(MessageSchema.parse(message).messageId).toBe('message-1');
    expect(MessageSchema.parse(message).sessionId).toBe('session-1');
    expect(MessageSchema.parse(message).turnId).toBe('turn-1');
    expect(() => MessageSchema.parse({ ...message, role: 'developer' })).toThrow();
  });

  test('round-trips typed session mentions and rejects malformed identities', () => {
    const mentions = [
      { kind: 'session', sessionId: 's1', title: 'Session' },
      { kind: 'session-message', sessionId: 's2', messageId: 'm2', sessionTitle: 'Other', excerpt: 'Hello' },
    ];
    const part = { ...textPart, sessionMentions: mentions };
    expect(PartSchema.parse(JSON.parse(JSON.stringify(part)))).toEqual(part);
    expect(PartSchema.safeParse({ ...part, sessionMentions: [{ kind: 'session-message', sessionId: 's', sessionTitle: 'T', excerpt: 'E' }] }).success).toBe(false);
    expect(PartSchema.safeParse({ ...part, sessionMentions: [{ ...mentions[0], metadata: {} }] }).success).toBe(false);
  });

  test('a failed result carries a machine kind beside its human detail', () => {
    const failed = { ...toolResultPart, isError: true, error: 'Command timed out after 30s', errorKind: 'timeout' };
    expect(ToolResultPartSchema.parse(failed)).toEqual(failed);
    expect(PartSchema.parse(failed)).toEqual(failed);
    expect(ToolResultPartSchema.parse(toolResultPart).errorKind).toBeUndefined();
    expect(ToolResultPartSchema.safeParse({ ...failed, errorKind: '' }).success).toBe(false);
  });

  test('an assistant step carries absolute start, first-token and completion times', () => {
    const message = {
      messageId: 'message-timed', sessionId: 'session-1', turnId: 'turn-1', role: 'assistant',
      createdAt: 1000, parts: [textPart],
      timing: { startedAt: 1000, firstTokenAt: 1420, completedAt: 3050 },
    };
    expect(MessageSchema.parse(message)).toEqual(message);
    expect(MessageSchema.parse({ ...message, timing: { startedAt: 1000 } }).timing).toEqual({ startedAt: 1000 });
    // A partially timed step still restores: the live stream publishes the
    // start before the first token exists.
    expect(MessageSchema.safeParse({ ...message, timing: { startedAt: 1000, firstTokenAt: 1420 } }).success).toBe(true);
    expect(() => MessageSchema.parse({ ...message, timing: { startedAt: -1 } })).toThrow();
    expect(MessageSchema.parse({ ...message, timing: undefined }).timing).toBeUndefined();
  });

  test('round-trips async_job_result notice parts', () => {
    const notice = {
      type: 'notice' as const,
      partId: 'part-async',
      noticeType: 'async_job_result' as const,
      level: 'info' as const,
      details: {
        jobs: [
          {
            jobId: 'SettingsAuditScout',
            subagentId: 'SettingsAuditScout',
            childSessionId: '01950000-0000-7000-8000-000000000001',
            type: 'task',
            status: 'completed' as const,
            label: 'Audit settings',
            durationMs: 1250,
            reportText: '## Findings\nAll clear.',
          },
        ],
      },
    };
    expect(AsyncJobResultNoticePartSchema.parse(notice)).toEqual(notice);
    expect(NoticePartSchema.parse(notice)).toEqual(notice);
    expect(PartSchema.parse(notice)).toEqual(notice);
    expect(AsyncJobResultNoticePartSchema.safeParse({
      ...notice,
      details: { jobs: [{ jobId: 'j1', status: 'unknown', reportText: 'x' }] },
    }).success).toBe(false);
  });
});

describe('token usage schema', () => {
  const cost = { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 };
  const usage = { input: 7, output: 5, cacheRead: 2, cacheWrite: 1, totalTokens: 12, cost };

  test('accepts usage records written before reasoning was published', () => {
    // Existing sessions on disk carry no `reasoning`; a strict object that
    // required it would refuse every restored transcript.
    expect(TokenUsageSchema.parse(usage)).toEqual(usage);
  });

  test('projects reasoning as a separate informative counter, never into the total', () => {
    const projected = TokenUsageSchema.parse({ ...usage, reasoning: 3 });
    expect(projected.reasoning).toBe(3);
    // The provider already counts reasoning inside its own total.
    expect(projected.totalTokens).toBe(12);
    expect(projected.totalTokens).toBe(usage.totalTokens);
  });

  test('rejects negative or fractional reasoning counts', () => {
    expect(() => TokenUsageSchema.parse({ ...usage, reasoning: -1 })).toThrow();
    expect(() => TokenUsageSchema.parse({ ...usage, reasoning: 1.5 })).toThrow();
  });
});
