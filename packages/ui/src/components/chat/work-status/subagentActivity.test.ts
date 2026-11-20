import { describe, expect, test } from 'bun:test';
import type { Message, Part, ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';
import {
  decodeSubagentActivity,
  encodeSubagentActivity,
  lastConversationMessage,
  readSubagentActivity as readActivity,
  reportFirstLine,
  subagentAlertInputs,
} from './subagentActivity';

const readSubagentActivity = (messages: readonly Message[] | undefined, parts: Readonly<Record<string, Part[]>>, status: Parameters<typeof readActivity>[1]) =>
  readActivity(messages?.map(message => ({ ...message, parts: parts[message.messageId] ?? message.parts })), status, new Set(['turn']));

const step = (messageId: string, extra: Partial<Message> = {}): Message => ({
  messageId, sessionId: 'child', turnId: 'turn', role: 'assistant', createdAt: 1_000, parts: [], ...extra,
});
const tool = (toolCallId: string, toolName: string, input: ToolCallPart['input'], status: ToolCallPart['status'] = 'running'): ToolCallPart => ({
  type: 'tool_call', partId: toolCallId, toolCallId, toolName, input, status,
});
const result = (toolCallId: string, isError = false, toolName = 'bash'): ToolResultPart => ({
  type: 'tool_result', partId: `result_${toolCallId}`, toolCallId, toolName, isError,
  ...(isError ? { error: 'Command failed' } : { output: '' }),
});

describe('readSubagentActivity', () => {
  test('describes a native call without fabricating a tool start time', () => {
    const parts = { s1: [tool('t1', 'bash', { command: 'bun test relay\nmore' })] };
    expect(readSubagentActivity([step('s1')], parts, 'running')).toEqual({ kind: 'tool', tool: null, detail: 'bun test relay', since: null });
  });

  test('a long-running call stays a tool rather than a silent wait', () => {
    const parts = { s1: [tool('t0', 'read', { path: 'a.ts' }, 'completed'), tool('t1', 'bash', { command: 'sleep 600' })] };
    expect(readSubagentActivity([step('s1')], parts, 'running')?.kind).toBe('tool');
  });

  test('system records do not replace conversation progress', () => {
    const messages = [step('s1'), step('system', { role: 'system', createdAt: 5_000 })];
    expect(lastConversationMessage(messages)?.messageId).toBe('s1');
    expect(readSubagentActivity(messages, { s1: [tool('t1', 'bash', { command: 'sleep 600' })] }, 'running')?.kind).toBe('tool');
  });

  test('streaming reasoning and text use canonical content', () => {
    expect(readSubagentActivity([step('s1', { parts: [{ type: 'reasoning', partId: 'r', content: '…' }] })], {}, 'running')).toEqual({ kind: 'thinking' });
    expect(readSubagentActivity([step('s1')], { s1: [{ type: 'text', partId: 'x', content: '…' }] }, 'running')).toEqual({ kind: 'writing' });
  });

  test('between steps it remembers the last native call', () => {
    const messages = [step('s1'), step('s2', { createdAt: 4_000 })];
    const parts = { s1: [tool('t1', 'read', { path: 'src/deep/SessionList.tsx' }, 'completed')], s2: [] };
    expect(readSubagentActivity(messages, parts, 'running')).toEqual({ kind: 'waiting', since: 4_000, last: { tool: 'Read', detail: 'SessionList.tsx' } });
  });

  test('a completed step uses its authoritative completion time', () => {
    const message = step('s1', { timing: { startedAt: 1_000, completedAt: 3_000 }, parts: [{ type: 'text', partId: 'text', content: 'Done' }] });
    expect(readSubagentActivity([message], {}, 'running')).toEqual({ kind: 'waiting', since: 3_000, last: null });
  });

  test.each([false, true])('a paired result settles a call, including an error result (%s)', (isError) => {
    const parts = { s1: [tool('t1', 'bash', { command: 'exit 1' }), result('t1', isError)] };
    expect(readSubagentActivity([step('s1')], parts, 'running')?.kind).toBe('waiting');
    expect(readSubagentActivity([step('s1')], { s1: [...parts.s1.slice(0, 1), result('t1', isError, 'custom')] }, 'running')?.kind).toBe('tool');
  });

  test('native approval states stay pending and are not completed calls', () => {
    expect(readSubagentActivity([step('s1')], { s1: [tool('t1', 'bash', { command: 'ls' }, 'pending_approval')] }, 'awaiting_approval')?.kind).toBe('tool');
  });

  test('a canonical retry notice supplies its attempt and error, not an invented deadline', () => {
    const retry: Part = { type: 'notice', partId: 'retry', noticeType: 'auto_retry_start', level: 'warning', details: { attempt: 3, maxAttempts: 5, delayMs: 8_000, errorMessage: 'Overloaded' } };
    expect(readSubagentActivity([step('s1')], { s1: [retry] }, 'running')).toEqual({ kind: 'retry', attempt: 3, at: null, error: 'Overloaded' });
    expect(readSubagentActivity([step('s1')], { s1: [retry, { type: 'text', partId: 'text', content: 'Resumed' }] }, 'running')?.kind).toBe('writing');
  });

  test('a new user prompt cuts off the previous turn last-tool lookup', () => {
    const messages = [step('s1'), step('u1', { role: 'user', createdAt: 2_000 })];
    expect(readSubagentActivity(messages, { s1: [tool('t1', 'bash', { command: 'ls' }, 'completed')] }, 'running')).toEqual({ kind: 'waiting', since: 2_000, last: null });
  });

  test('missing history and idle or unavailable sessions never claim live progress', () => {
    expect(readSubagentActivity(undefined, {}, 'running')).toBeNull();
    expect(readSubagentActivity([], {}, 'running')).toBeNull();
    expect(lastConversationMessage(undefined)).toBeUndefined();
    expect(lastConversationMessage([step('system', { role: 'system' })])).toBeUndefined();
    for (const status of ['idle', 'unavailable', undefined] as const) {
      expect(readSubagentActivity([step('s1')], { s1: [tool('t1', 'bash', { command: 'sleep 600' })] }, status)).toBeNull();
    }
  });

  test('a running status alone cannot revive history outside the active turn', () => {
    const messages = [step('s1', { parts: [tool('t1', 'bash', { command: 'sleep 600' })] })];
    expect(readActivity(messages, 'running', new Set(['new_turn']))).toBeNull();
    expect(readActivity(messages, 'running', new Set())).toBeNull();
  });

  test('activity stays referentially encoded while only streamed text grows', () => {
    const messages = [step('s1')];
    const first: Part = { type: 'text', partId: 'text', content: 'a' };
    const encoded = encodeSubagentActivity(readSubagentActivity(messages, { s1: [first] }, 'running'));
    expect(encodeSubagentActivity(readSubagentActivity(messages, { s1: [{ ...first, content: 'a longer text' }] }, 'running'))).toBe(encoded);
    expect(decodeSubagentActivity(encoded)).toEqual({ kind: 'writing' });
    expect(decodeSubagentActivity('')).toBeNull();
  });
});

describe('subagentAlertInputs', () => {
  test('keeps only values that can raise an alert', () => {
    expect(subagentAlertInputs({ kind: 'tool', tool: 'Read', detail: 'a.ts', since: null })).toBeNull();
    expect(subagentAlertInputs({ kind: 'waiting', since: 5, last: { tool: 'Read', detail: 'a.ts' } })).toEqual({ kind: 'waiting', since: 5, last: null });
    expect(subagentAlertInputs({ kind: 'retry', attempt: 2, at: null, error: null })?.kind).toBe('retry');
  });
});

describe('reportFirstLine', () => {
  test('takes the first non-empty line without Markdown marks', () => {
    expect(reportFirstLine('\n## **Two ADRs** are stale\n\nmore')).toBe('Two ADRs are stale');
    expect(reportFirstLine('```ts\ncode\n```')).toBe('code');
    expect(reportFirstLine('- `0018` is stale')).toBe('0018 is stale');
    expect(reportFirstLine('   \n---\n')).toBeNull();
    expect(reportFirstLine('The command completed with output:\n\n```\ndone\n```')).toBe('The command completed with output: done');
  });
});
