import { describe, expect, test } from 'bun:test';
import type { Message, Part } from '@openchamber/agent-contract';
import { getLiveFinalMessage, getTurnsWithLaterAssistant, hasLiveActivity } from './liveActivity';
import { projectTurnRecords } from './projectTurnRecords';
import { summarizeLiveActivity } from './liveActivitySummary';
import type { ChatMessageEntry } from './types';

const text = (content: string): Part => ({ type: 'text', partId: content, content });
const assistant = (messageId: string, parts: Part[], options: Partial<Message> = {}): ChatMessageEntry => ({ messageId, sessionId: 'session', turnId: 'turn', role: 'assistant', createdAt: 2, parts, ...options });
const user = (messageId = 'user'): ChatMessageEntry => ({ messageId, sessionId: 'session', turnId: messageId, role: 'user', createdAt: 1, parts: [text(`Request ${messageId}`)] });
const tool = (partId: string, toolName: string, status: 'completed' | 'failed' | 'running' = 'completed'): Part => ({ type: 'tool_call', partId, toolCallId: partId, toolName, input: {}, status });

describe('live activity projection', () => {
  test('finds the final assistant message for the active turn', () => {
    const messages = [user(), assistant('assistant-1', [text('draft')]), assistant('assistant-2', [text('final')])];
    expect(getLiveFinalMessage(messages)).toMatchObject({ messageId: 'assistant-2' });
  });
  test('detects live tool activity from projected turn records', () => {
    const [activeTurn] = projectTurnRecords([user(), assistant('assistant-1', [tool('tool-1', 'shell', 'running')])]).turns;
    const [textOnlyTurn] = projectTurnRecords([user(), assistant('assistant-2', [text('done')])]).turns;
    expect(activeTurn).toBeDefined();
    expect(hasLiveActivity(activeTurn!, false)).toBe(true);
    expect(textOnlyTurn).toBeDefined();
    expect(hasLiveActivity(textOnlyTurn!, false)).toBe(false);
  });
  test('marks turns with a later assistant response', () => {
    const records = projectTurnRecords([user(), assistant('assistant-1', [text('first')]), user('user-2'), assistant('assistant-2', [text('second')])]).turns;
    expect(getTurnsWithLaterAssistant(records)).toEqual(new Set(['user']));
  });
  test('summarizes live activity without legacy message wrappers', () => {
    const summary = summarizeLiveActivity([assistant('assistant-1', [tool('tool-1', 'shell', 'running')])]);
    expect(summary.commands).toBe(1);
  });
});
