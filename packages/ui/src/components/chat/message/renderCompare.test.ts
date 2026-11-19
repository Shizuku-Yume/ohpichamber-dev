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

<<<<<<< HEAD
describe('message render comparison', () => {
  const running: Message = {
    messageId: 'msg_1', sessionId: 'ses_1', turnId: 'turn_1', role: 'assistant', createdAt: 1,
    parts: [{ type: 'text', partId: 'part_1', content: 'Summary so far' }],
||||||| bc50ba56aa
describe('running compaction', () => {
  const running: CompactionMessage = {
    id: 'msg_compact', sessionID: 'ses_1', role: 'compaction', time: { created: 1 }, status: 'running', reason: 'auto', summary: '',
=======
describe('running compaction', () => {
  test('re-renders when compaction model attribution arrives or changes', () => {
    const before = { ...running, status: 'completed' as const };
    const after = { ...before, model: { providerID: 'p', id: 'm' } };
    const changed = { ...after, model: { providerID: 'other', id: 'm' } };
    const changedID = { ...after, model: { providerID: 'p', id: 'other' } };
    expect(areRenderRelevantMessagesEqual({ info: before, parts: [] }, { info: after, parts: [] })).toBe(false);
    expect(areRenderRelevantMessagesEqual({ info: after, parts: [] }, { info: changed, parts: [] })).toBe(false);
    expect(areRenderRelevantMessagesEqual({ info: after, parts: [] }, { info: changedID, parts: [] })).toBe(false);
    expect(areRenderRelevantMessagesEqual({ info: after, parts: [] }, { info: { ...after, model: { ...after.model } }, parts: [] })).toBe(true);
  });

  const running: CompactionMessage = {
    id: 'msg_compact', sessionID: 'ses_1', role: 'compaction', time: { created: 1 }, status: 'running', reason: 'auto', summary: '',
>>>>>>> upstream/main
  };

  test('re-renders as message content changes', () => {
    const grown: Message = { ...running, parts: [{ type: 'text', partId: 'part_1', content: 'Summary so far, with more' }] };
    expect(areRenderRelevantMessagesEqual({ info: running, parts: running.parts }, { info: grown, parts: grown.parts })).toBe(false);
  });

  test('preserves an equivalent rebuilt record', () => {
    expect(areRenderRelevantMessagesEqual({ info: running, parts: running.parts }, { info: { ...running }, parts: [...running.parts] })).toBe(true);
  });

  test('re-renders when captured session mention identity or label changes', () => {
    const mention = { kind: 'session-message' as const, sessionId: 'session', messageId: 'message', sessionTitle: 'Title', excerpt: 'Excerpt' };
    const original: Message = { ...running, role: 'user', parts: [{ type: 'text', partId: 'part_1', content: 'link', sessionMentions: [mention] }] };
    const compare = (message: Message) => areRenderRelevantMessagesEqual({ info: original, parts: original.parts }, { info: message, parts: message.parts });
    expect(compare({ ...original, parts: [{ type: 'text', partId: 'part_1', content: 'link', sessionMentions: [{ ...mention }] }] })).toBe(true);
    expect(compare({ ...original, parts: [{ type: 'text', partId: 'part_1', content: 'link', sessionMentions: [{ ...mention, messageId: 'other' }] }] })).toBe(false);
    expect(compare({ ...original, parts: [{ type: 'text', partId: 'part_1', content: 'link', sessionMentions: [{ ...mention, excerpt: 'Changed' }] }] })).toBe(false);
    expect(compare({ ...original, parts: [{ type: 'text', partId: 'part_1', content: 'link' }] })).toBe(false);
  });
});
