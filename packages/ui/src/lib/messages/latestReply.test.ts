import { describe, expect, test } from 'bun:test';
import type { Message, Turn } from '@openchamber/agent-contract';

<<<<<<< HEAD
import { findLatestCompletedReply, turnMessageIds } from './latestReply';
=======
import { findCompletedReplyIds, findLatestCompletedReply, type LatestReplyRecord } from './latestReply';
>>>>>>> bc50ba56a

const userMessage = (messageId: string, turnId: string): Message => ({
  messageId,
  sessionId: 'ses_1',
  turnId,
  role: 'user',
  createdAt: 1,
  parts: [{ type: 'text', partId: `${messageId}_part`, content: 'user prompt' }],
});

const assistantMessage = (messageId: string, text: string, turnId: string): Message => ({
  messageId,
  sessionId: 'ses_1',
  turnId,
  role: 'assistant',
  createdAt: 2,
  parts: text ? [{ type: 'text', partId: `${messageId}_part`, content: text }] : [],
});

const toolStep = (messageId: string, turnId: string): Message => ({
  messageId,
  sessionId: 'ses_1',
  turnId,
  role: 'assistant',
  createdAt: 3,
  parts: [{ type: 'reasoning', partId: `${messageId}_part`, content: 'Thinking about the edit' }],
});

const turn = (
  turnId: string,
  status: Turn['status'],
  assistantMessageIds: string[],
  userMessageId = 'user_1',
): Turn => ({
  turnId,
  sessionId: 'ses_1',
  runId: `run_${turnId}`,
  status,
  userMessageId,
  assistantMessageIds,
  startedAt: 1,
  finishedAt: status === 'completed' ? 2 : undefined,
});

describe('findLatestCompletedReply', () => {
  test('returns the final answer of the newest completed turn', () => {
    const messages = [
      userMessage('user_1', 'turn_1'),
      assistantMessage('assistant_1', 'First answer', 'turn_1'),
      userMessage('user_2', 'turn_2'),
      assistantMessage('assistant_2', 'Progress note', 'turn_2'),
      assistantMessage('assistant_3', 'Second answer', 'turn_2'),
    ];
    const turns = [
      turn('turn_1', 'completed', ['assistant_1'], 'user_1'),
      turn('turn_2', 'completed', ['assistant_2', 'assistant_3'], 'user_2'),
    ];

    expect(findLatestCompletedReply(turns, messages)).toEqual({ messageId: 'assistant_3', text: 'Second answer' });
  });

  test('a running newest turn has no reply, and never falls back to an older answer', () => {
    const messages = [
      userMessage('user_1', 'turn_1'),
      assistantMessage('assistant_1', 'Completed answer', 'turn_1'),
      userMessage('user_2', 'turn_2'),
      assistantMessage('assistant_2', 'Streaming answer', 'turn_2'),
    ];
    const turns = [
      turn('turn_1', 'completed', ['assistant_1'], 'user_1'),
      turn('turn_2', 'running', ['assistant_2'], 'user_2'),
    ];

    expect(findLatestCompletedReply(turns, messages)).toBeNull();
  });

  test('a failed newest turn has no reply, even with partial text', () => {
    const messages = [
      userMessage('user_1', 'turn_1'),
      assistantMessage('assistant_1', 'Completed answer', 'turn_1'),
      userMessage('user_2', 'turn_2'),
      assistantMessage('assistant_2', 'Partial text before the failure', 'turn_2'),
    ];
    const turns = [
      turn('turn_1', 'completed', ['assistant_1'], 'user_1'),
      turn('turn_2', 'failed', ['assistant_2'], 'user_2'),
    ];

    expect(findLatestCompletedReply(turns, messages)).toBeNull();
  });

  test('a cancelled newest turn has no reply', () => {
    const messages = [
      userMessage('user_1', 'turn_1'),
      assistantMessage('assistant_1', 'Completed answer', 'turn_1'),
      userMessage('user_2', 'turn_2'),
      assistantMessage('assistant_2', 'Cut off', 'turn_2'),
    ];
    const turns = [
      turn('turn_1', 'completed', ['assistant_1'], 'user_1'),
      turn('turn_2', 'cancelled', ['assistant_2'], 'user_2'),
    ];

    expect(findLatestCompletedReply(turns, messages)).toBeNull();
  });

  test('a completed turn whose final message has no text has no reply, not the progress step', () => {
    const messages = [
      userMessage('user_2', 'turn_2'),
      assistantMessage('assistant_progress', 'I will edit the file now', 'turn_2'),
      toolStep('assistant_step', 'turn_2'),
    ];
    const turns = [turn('turn_2', 'completed', ['assistant_progress', 'assistant_step'], 'user_2')];

    expect(findLatestCompletedReply(turns, messages)).toBeNull();
  });

  test('a completed turn whose final message is missing from the transcript has no reply', () => {
    const messages = [userMessage('user_2', 'turn_2')];
    const turns = [turn('turn_2', 'completed', ['assistant_absent'], 'user_2')];

    expect(findLatestCompletedReply(turns, messages)).toBeNull();
  });

  test('an awaiting-input turn has no answer yet', () => {
    const messages = [
      userMessage('user_2', 'turn_2'),
      assistantMessage('assistant_2', 'What should I do?', 'turn_2'),
    ];
    const turns = [turn('turn_2', 'awaiting_input', ['assistant_2'], 'user_2')];

    expect(findLatestCompletedReply(turns, messages)).toBeNull();
  });

  test('no turns at all means nothing to read', () => {
    expect(findLatestCompletedReply([], [])).toBeNull();
  });
});

describe('turnMessageIds', () => {
  test('names the prompt and every assistant message of one turn', () => {
    const value = turn('turn_2', 'completed', ['assistant_1', 'assistant_2'], 'user_2');

    expect(turnMessageIds(value)).toEqual(['user_2', 'assistant_1', 'assistant_2']);
  });
});

describe('findCompletedReplyIds', () => {
    test('returns every finished answer in history, across turns', () => {
        const ids = findCompletedReplyIds([
            userMessage('user_1'),
            assistantMessage('assistant_1', 'First answer', { finish: 'stop', completed: 10 }),
            userMessage('user_2'),
            assistantMessage('assistant_2', 'Progress note', { finish: 'tool-calls', completed: 20 }),
            assistantMessage('assistant_3', 'Second answer', { finish: 'stop', completed: 30 }),
        ]);

        expect(ids).toEqual(['assistant_1', 'assistant_3']);
    });

    test('leaves out unfinished, aborted, and empty messages', () => {
        const ids = findCompletedReplyIds([
            userMessage('user_1'),
            assistantMessage('assistant_1', 'Still streaming', { finish: 'stop' }),
            assistantMessage('assistant_2', 'Partial text', { finish: 'error', completed: 10 }),
            assistantMessage('assistant_3', '', { finish: 'stop', completed: 20 }),
            assistantMessage('assistant_4', 'The answer', { finish: 'stop', completed: 30 }),
        ]);

        expect(ids).toEqual(['assistant_4']);
    });
});
