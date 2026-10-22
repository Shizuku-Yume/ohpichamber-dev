import { describe, expect, test } from 'bun:test';
import type { Part } from '@/lib/opencode/model';
import { buildProjectionCacheKey } from './turnProjectionCache';
import type { ChatMessageEntry } from './types';

const createEntry = (text: string, id = 'msg_1'): ChatMessageEntry => ({
  info: { id, sessionID: 'session_1', role: 'assistant', time: { created: 1 }, agent: 'build', providerID: 'p', modelID: 'm' },
  parts: [{ id: `prt_${id}`, sessionID: 'session_1', messageID: id, type: 'text', text }],
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
    const after: ChatMessageEntry[] = [
      {
        info: before[0].info,
        parts: [{ id: 'prt_1', sessionID: 'session_1', messageID: 'msg_1', type: 'text', text: 'hello' }],
      },
    ];

    const beforeKey = buildProjectionCacheKey('session_1', before, false, false, 'merge');
    const afterKey = buildProjectionCacheKey('session_1', after, false, false, 'merge');

    expect(afterKey).not.toBe(beforeKey);
  });
});

const userInfo = (id: string) => ({ id, sessionID: 'session_1', role: 'user' as const, time: { created: 1 } });
const textPart = (id: string, messageID: string): Part => ({ id, sessionID: 'session_1', messageID, type: 'text', text: 'x' });

describe('turnProjectionCache key cost', () => {
  // Counts element reads on a parts array without changing its contents.
  const countingParts = (parts: Part[], counter: { reads: number }): Part[] => {
    const counted = [...parts];
    parts.forEach((part, index) => {
      Object.defineProperty(counted, index, {
        get: () => {
          counter.reads += 1;
          return part;
        },
      });
    });
    return counted;
  };

  test('builds the key without reading individual parts', () => {
    const counter = { reads: 0 };
    const messages: ChatMessageEntry[] = Array.from({ length: 300 }, (_, messageIndex) => ({
      info: userInfo(`msg_${messageIndex}`),
      parts: countingParts(
        Array.from({ length: 30 }, (_, partIndex) => textPart(`prt_${messageIndex}_${partIndex}`, `msg_${messageIndex}`)),
        counter,
      ),
    }));

    buildProjectionCacheKey('session_1', messages, false, false, 'merge');

    // The previous key read every part of every message: 9000 reads here.
    expect(counter.reads).toBe(0);
  });

  test('changes the key when a message gets a new parts array after a part update', () => {
    const entry = createEntry('one');
    const before = [entry];
    const after = [{ info: entry.info, parts: [...entry.parts, textPart('prt_2', 'msg_1')] }];

    expect(buildProjectionCacheKey('session_1', after, false, false, 'merge'))
      .not.toBe(buildProjectionCacheKey('session_1', before, false, false, 'merge'));
  });

  test('keeps the key when a rebuilt messages array holds the same records', () => {
    const messages = [createEntry('a'), createEntry('b', 'msg_2')];

    expect(buildProjectionCacheKey('session_1', [...messages], false, false, 'merge'))
      .toBe(buildProjectionCacheKey('session_1', messages, false, false, 'merge'));
  });

  test('changes the key when a message info record is replaced', () => {
    const entry = createEntry('a');
    const replaced = { info: { ...entry.info }, parts: entry.parts };

    expect(buildProjectionCacheKey('session_1', [replaced], false, false, 'merge'))
      .not.toBe(buildProjectionCacheKey('session_1', [entry], false, false, 'merge'));
  });
});
