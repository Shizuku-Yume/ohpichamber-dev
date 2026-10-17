import { describe, expect, test } from 'bun:test';
import type { Message, Part } from '@openchamber/agent-contract';
import { buildProjectionCacheKey } from './turnProjectionCache';
import type { ChatMessageEntry } from './types';

const createEntry = (text: string): ChatMessageEntry => ({
  messageId: 'msg_1', sessionId: 'session_1', turnId: 'msg_1', role: 'assistant', createdAt: 1,
  parts: [{ type: 'text', partId: 'prt_1', content: text }],
});

describe('turnProjectionCache', () => {
  test('keeps the cache key stable for unchanged message and part references', () => {
    const messages = [createEntry('hello')];
    const first = buildProjectionCacheKey('session_1', messages, false, false, 'merge');
    const second = buildProjectionCacheKey('session_1', messages, false, false, 'merge');
    expect(second).toBe(first);
  });

  test('changes the cache key when streaming replaces a part with the same id and count', () => {
    const before = [createEntry('hel')];
    const after: ChatMessageEntry[] = [{ ...before[0], parts: [{ type: 'text', partId: 'prt_1', content: 'hello' }] }];
    const beforeKey = buildProjectionCacheKey('session_1', before, false, false, 'merge');
    const afterKey = buildProjectionCacheKey('session_1', after, false, false, 'merge');
    expect(afterKey).not.toBe(beforeKey);
  });
});

const userInfo = (id: string): Message => ({ messageId: id, sessionId: 'session_1', turnId: id, role: 'user', createdAt: 1, parts: [] });
const textPart = (id: string, _messageID: string): Part => ({ type: 'text', partId: id, content: 'x' });

describe('turnProjectionCache key cost', () => {
  const countingParts = (parts: Part[], counter: { reads: number }): Part[] => {
    const counted = [...parts];
    parts.forEach((part, index) => {
      Object.defineProperty(counted, index, { get: () => { counter.reads += 1; return part; } });
    });
    return counted;
  };

  test('builds the key without reading individual parts', () => {
    const counter = { reads: 0 };
    const messages: ChatMessageEntry[] = Array.from({ length: 300 }, (_, messageIndex) => ({
      ...userInfo(`msg_${messageIndex}`),
      parts: countingParts(Array.from({ length: 30 }, (_, partIndex) => textPart(`prt_${messageIndex}_${partIndex}`, `msg_${messageIndex}`)), counter),
    }));
    buildProjectionCacheKey('session_1', messages, false, false, 'merge');
    expect(counter.reads).toBe(0);
  });

  test('changes the key when a message gets a new parts array after a part update', () => {
    const entry = createEntry('one');
    const before = [entry];
    const after = [{ ...entry, parts: [...entry.parts, textPart('prt_2', 'msg_1')] }];
    expect(buildProjectionCacheKey('session_1', after, false, false, 'merge')).not.toBe(buildProjectionCacheKey('session_1', before, false, false, 'merge'));
  });

  test('keeps the key when a rebuilt messages array holds the same records', () => {
    const messages = [createEntry('a'), createEntry('b')];
    expect(buildProjectionCacheKey('session_1', [...messages], false, false, 'merge')).toBe(buildProjectionCacheKey('session_1', messages, false, false, 'merge'));
  });

  test('changes the key when a message info record is replaced', () => {
    const entry = createEntry('a');
    const replaced = { ...entry };
    expect(buildProjectionCacheKey('session_1', [replaced], false, false, 'merge')).not.toBe(buildProjectionCacheKey('session_1', [entry], false, false, 'merge'));
  });
});
