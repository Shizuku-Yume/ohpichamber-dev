import { describe, expect, test } from 'bun:test';
import type { Part } from '@openchamber/agent-contract';
import {
  derivePartsLabel, deriveUserSnippet, formatAssistantTokens,
  formatMessagePreviewTime, truncateMessageId,
} from '../rawMessagePreview';

const text = (content: string): Part => ({ type: 'text', partId: 'text', content });
const attachment: Part = {
  type: 'attachment', partId: 'attachment', attachmentId: 'upload', name: 'image.png',
  mediaType: 'image/png', size: 42, uri: 'attachment://upload',
};
const call: Part = {
  type: 'tool_call', partId: 'call', toolCallId: 'tool', toolName: 'bash', input: {}, status: 'running',
};
const result: Part = {
  type: 'tool_result', partId: 'result', toolCallId: 'tool', toolName: 'bash', output: 'ok', isError: false,
};

describe('truncateMessageId', () => {
  test('shows distinguishing suffixes', () => {
    const id = 'message-long-prefix-12345678';
    expect(truncateMessageId(id)).toBe('12345678');
    expect(truncateMessageId('message-long-prefix-abcdefgh')).toBe('abcdefgh');
  });
  test('keeps short and empty ids', () => {
    expect(truncateMessageId('abc')).toBe('abc');
    expect(truncateMessageId('12345678')).toBe('12345678');
    expect(truncateMessageId('')).toBe('');
  });
  test('supports a custom suffix length', () => {
    expect(truncateMessageId('abcdefghij', 4)).toBe('ghij');
  });
});

describe('derivePartsLabel', () => {
  test('returns empty for no parts', () => expect(derivePartsLabel([])).toBe(''));
  test('names native calls and results without duplicate tool labels', () => {
    expect(derivePartsLabel([text('a'), call, result, text('b')])).toBe('text + bash');
  });
  test('preserves native tool names', () => {
    expect(derivePartsLabel([{ ...call, toolName: 'CustomTool' }])).toBe('CustomTool');
  });
  test('labels attachments, reasoning and step summaries directly', () => {
    expect(derivePartsLabel([attachment, { type: 'reasoning', partId: 'r', content: 'thinking' },
      { type: 'step_summary', partId: 's', title: 'Done' }])).toBe('attachment + reasoning + step_summary');
  });
});

describe('deriveUserSnippet', () => {
  test('keeps full text, punctuation and Unicode while collapsing whitespace', () => {
    expect(deriveUserSnippet([text('  olá,\n\n mundo!\t123  ')])).toBe('olá, mundo! 123');
    expect(deriveUserSnippet([text('hello world this is long')])).toBe('hello world this is long');
  });
  test('skips empty text and uses the first non-empty content', () => {
    expect(deriveUserSnippet([text('  '), text('next'), text('last')])).toBe('next');
  });
  test('counts only native attachments', () => {
    expect(deriveUserSnippet([attachment])).toBe('1 attachment');
    expect(deriveUserSnippet([attachment, attachment, call, result])).toBe('2 attachments');
  });
  test('never displays tool output or reasoning as prompt text', () => {
    expect(deriveUserSnippet([call, result, { type: 'reasoning', partId: 'r', content: 'secret' }])).toBe('');
  });
  test('returns empty for no readable content', () => {
    expect(deriveUserSnippet([])).toBe('');
    expect(deriveUserSnippet([text('  '), text('')])).toBe('');
  });
});

describe('formatMessagePreviewTime', () => {
  const timestamp = Date.UTC(2024, 0, 15, 14, 35);
  test('handles missing and invalid timestamps', () => {
    expect(formatMessagePreviewTime(null, '24h')).toBe('-');
    expect(formatMessagePreviewTime(Number.NaN, '24h')).toBe('-');
  });
  test('respects explicit and automatic clock preferences', () => {
    expect(/AM|PM/i.test(formatMessagePreviewTime(timestamp, '24h'))).toBe(false);
    expect(/AM|PM/i.test(formatMessagePreviewTime(timestamp, '12h'))).toBe(true);
    expect(formatMessagePreviewTime(timestamp, 'auto').length).toBeGreaterThan(0);
  });
});

describe('formatAssistantTokens', () => {
  test('formats both counters, including zero', () => {
    expect(formatAssistantTokens(340, 1205, n => n.toLocaleString('en-US'))).toBe('340 / 1,205');
    expect(formatAssistantTokens(0, 0, String)).toBe('0 / 0');
    expect(formatAssistantTokens(1234, 5678, String)).toBe('1234 / 5678');
  });
});
