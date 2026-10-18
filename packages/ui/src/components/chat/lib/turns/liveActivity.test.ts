import { describe, expect, test } from 'bun:test';
import type { Message, Part } from '@openchamber/agent-contract';
import { getLiveFinalMessage, getTurnsWithLaterAssistant, hasLiveActivity } from './liveActivity';
import { projectTurnRecords } from './projectTurnRecords';
import { summarizeLiveActivity } from './liveActivitySummary';
import type { ChatMessageEntry } from './types';

const text = (content: string): Part => ({ type: 'text', partId: content, content });
const assistant = (messageId: string, parts: Part[], options: Partial<Message> = {}): ChatMessageEntry => ({ messageId, sessionId: 'session', turnId: 'turn', role: 'assistant', createdAt: 2, parts, ...options });
const user = (messageId = 'user', turnId = 'turn'): ChatMessageEntry => ({ messageId, sessionId: 'session', turnId, role: 'user', createdAt: 1, parts: [text(`Request ${messageId}`)] });
const tool = (partId: string, toolName: string, status: 'completed' | 'failed' | 'running' = 'completed'): Part => ({ type: 'tool_call', partId, toolCallId: partId, toolName, input: {}, status });

describe('live activity projection', () => {
  test('finds the final assistant message for the active turn', () => {
    const messages = [user(), assistant('assistant-1', [text('draft')]), assistant('assistant-2', [text('final')])];
    expect(getLiveFinalMessage(messages)).toMatchObject({ messageId: 'assistant-2' });
  });
  test('detects tool content only in its owning canonical turn projection', () => {
    const [activeTurn] = projectTurnRecords([user(), assistant('assistant-1', [tool('tool-1', 'bash', 'running')])]).turns;
    const [textOnlyTurn] = projectTurnRecords([user(), assistant('assistant-2', [text('done')])]).turns;
    expect(activeTurn).toBeDefined();
    expect(hasLiveActivity(activeTurn!, false)).toBe(true);
    expect(textOnlyTurn).toBeDefined();
    expect(hasLiveActivity(textOnlyTurn!, false)).toBe(false);
    const [unrelatedTurn] = projectTurnRecords([user(), assistant('orphan', [tool('orphan-tool', 'bash', 'running')], { turnId: 'unrelated' })]).turns;
    expect(unrelatedTurn?.assistantMessageIds).toEqual([]);
    expect(hasLiveActivity(unrelatedTurn!, false)).toBe(false);
  });
  test('anchors native task results and subsequent activity once after the standalone task call', () => {
    const taskCall: Part = {
      type: 'tool_call', partId: 'task-call', toolCallId: 'task-1', toolName: 'task', status: 'completed',
      input: { agent: 'task', task: 'Inspect the native boundary', solutionSpace: 'Read-only investigation' },
    };
    const taskResult: Part = {
      type: 'tool_result', partId: 'task-result', toolCallId: 'task-1', toolName: 'task', isError: false,
      output: { content: [{ type: 'text', text: 'Investigation complete' }], details: { results: [{ id: 'worker-1' }] } },
    };
    const [turn] = projectTurnRecords([
      user('turn'),
      assistant('assistant-before', [tool('before-task', 'bash'), taskCall, tool('after-task', 'read')]),
      assistant('assistant-result', [taskResult, tool('after-result', 'bash')]),
    ]).turns;

    expect(turn?.activityParts.map((activity) => activity.id)).toEqual([
      'before-task', 'task-call', 'after-task', 'task-result', 'after-result',
    ]);
    expect(turn?.activitySegments.map((segment) => ({
      afterToolPartId: segment.afterToolPartId,
      anchorMessageId: segment.anchorMessageId,
      parts: segment.parts.map((activity) => activity.id),
    }))).toEqual([
      { afterToolPartId: null, anchorMessageId: 'assistant-before', parts: ['before-task'] },
      { afterToolPartId: 'task-call', anchorMessageId: 'assistant-before', parts: ['after-task', 'task-result', 'after-result'] },
    ]);
  });
  test('marks turns with a later assistant response', () => {
    const records = projectTurnRecords([
      user('request-first', 'turn-first'),
      assistant('response-first', [text('first')], { turnId: 'turn-first' }),
      user('request-second', 'turn-second'),
      assistant('response-second', [text('second')], { turnId: 'turn-second' }),
    ]).turns;
    expect(records.map((turn) => turn.assistantMessageIds)).toEqual([['response-first'], ['response-second']]);
    expect(getTurnsWithLaterAssistant(records)).toEqual(new Set(['turn-first']));
    const queued = projectTurnRecords([
      user('request-first', 'turn-first'),
      assistant('response-first', [text('first')], { turnId: 'turn-first' }),
      user('request-second', 'turn-second'),
    ]).turns;
    expect(getTurnsWithLaterAssistant(queued)).toEqual(new Set());
  });
  test('summarizes live activity without legacy message wrappers', () => {
    const summary = summarizeLiveActivity([assistant('assistant-1', [{ type: 'tool_result', partId: 'result-1', toolCallId: 'tool-1', toolName: 'bash', isError: false, output: { content: [{ type: 'text', text: 'done' }], details: { exitCode: 0 } } }])]);
    expect(summary.commands).toBe(1);
  });
});
