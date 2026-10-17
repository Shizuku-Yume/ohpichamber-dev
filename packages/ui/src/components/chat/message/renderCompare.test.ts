import { describe, expect, test } from 'bun:test';
import type { Message } from '@openchamber/agent-contract';
import type { TurnGroupingContext } from '../lib/turns/types';
import { areRelevantTurnGroupingContextsEqual, areRenderRelevantMessagesEqual } from './renderCompare';

const finalAnswerContext: TurnGroupingContext = {
  turnId: 'turn',
  isFirstAssistantInTurn: false,
  isLastAssistantInTurn: true,
  isLatestTurn: true,
  isWorking: false,
  hasTools: false,
  hasReasoning: false,
  hasEarlierAssistantText: false,
};

describe('final answer divider context', () => {
  test('updates the final answer when earlier visible text appears or disappears', () => {
    const withEarlierText = { ...finalAnswerContext, hasEarlierAssistantText: true };
    expect(areRelevantTurnGroupingContextsEqual(finalAnswerContext, withEarlierText, 'answer', false)).toBe(false);
    expect(areRelevantTurnGroupingContextsEqual(withEarlierText, finalAnswerContext, 'answer', false)).toBe(false);
  });

  test('preserves equivalent rebuilt context', () => {
    expect(areRelevantTurnGroupingContextsEqual(finalAnswerContext, { ...finalAnswerContext }, 'answer', false)).toBe(true);
  });

  test('does not invalidate the user message for assistant decoration', () => {
    expect(areRelevantTurnGroupingContextsEqual(
      finalAnswerContext,
      { ...finalAnswerContext, hasEarlierAssistantText: true },
      'user',
      true,
    )).toBe(true);
  });
});

describe('completed-turn changed files', () => {
  const files = [{ file: 'src/a.ts', additions: 2, deletions: 1 }];

  test('re-renders when the changed file path changes without changing line counts', () => {
    const before = { ...finalAnswerContext, changedFiles: files };
    const after = { ...finalAnswerContext, changedFiles: [{ ...files[0], file: 'src/b.ts' }] };
    expect(areRelevantTurnGroupingContextsEqual(before, after, 'answer', false)).toBe(false);
  });

  test('preserves an equivalent rebuilt file list', () => {
    const before = { ...finalAnswerContext, changedFiles: files };
    const after = { ...finalAnswerContext, changedFiles: [{ ...files[0] }] };
    expect(areRelevantTurnGroupingContextsEqual(before, after, 'answer', false)).toBe(true);
  });
});

describe('message render comparison', () => {
  const running: Message = {
    messageId: 'msg_1', sessionId: 'ses_1', turnId: 'turn_1', role: 'assistant', createdAt: 1,
    parts: [{ type: 'text', partId: 'part_1', content: 'Summary so far' }],
  };

  test('re-renders as message content changes', () => {
    const grown: Message = { ...running, parts: [{ type: 'text', partId: 'part_1', content: 'Summary so far, with more' }] };
    expect(areRenderRelevantMessagesEqual({ info: running, parts: running.parts }, { info: grown, parts: grown.parts })).toBe(false);
  });

  test('preserves an equivalent rebuilt record', () => {
    expect(areRenderRelevantMessagesEqual({ info: running, parts: running.parts }, { info: { ...running }, parts: [...running.parts] })).toBe(true);
  });
});
