import { describe, expect, test } from 'bun:test';
import { AttachmentPartSchema, MessageSchema, PartSchema, ReasoningPartSchema, StepSummaryPartSchema, TextPartSchema, ToolCallPartSchema, ToolResultPartSchema, ToolStatusSchema, TurnSchema, TurnStatusSchema } from './messages.ts';

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
});
