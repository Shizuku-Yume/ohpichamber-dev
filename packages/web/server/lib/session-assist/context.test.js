import { describe, expect, it } from 'vitest';

import { excerpt, loadAssistContext, loadSettledTurns, newestContentId } from './context.js';
import { buildAssistPrompt } from './prompt.js';

const SESSION_ID = 'ses_1';
const BRANCH = { branchId: 'branch_1', branchVersion: '1', leafMessageId: null };
const user = (id, text, turnId = `turn-${id}`) => ({
  messageId: id, sessionId: SESSION_ID, turnId, role: 'user', createdAt: 1,
  parts: [{ type: 'text', partId: `part-${id}`, content: text }],
});
const assistant = (id, text, turnId) => ({
  messageId: id, sessionId: SESSION_ID, turnId, role: 'assistant', createdAt: 2,
  providerId: 'provider-1', modelId: 'model-1',
  parts: [{ type: 'text', partId: `part-${id}`, content: text }],
});
const system = (id, text, turnId) => ({
  messageId: id, sessionId: SESSION_ID, turnId, role: 'system', createdAt: 2,
  parts: [{ type: 'text', partId: `part-${id}`, content: text }],
});
const pair = (id, text = `answer ${id}`) => {
  const turnId = `turn-${id}`;
  return [user(`u${id}`, `request ${id}`, turnId), assistant(`a${id}`, text, turnId)];
};
const page = (messages, nextCursor = null, completedTurnIds = new Set(messages.filter((message) => message.role === 'assistant').map((message) => message.turnId))) => {
  const turnIds = [...new Set(messages.map((message) => message.turnId))];
  const turns = turnIds.map((turnId) => {
    const turnMessages = messages.filter((message) => message.turnId === turnId);
    const userMessage = turnMessages.find((message) => message.role === 'user');
    return {
      turnId, sessionId: SESSION_ID, runId: `run-${turnId}`, status: completedTurnIds.has(turnId) ? 'completed' : 'running',
      userMessageId: userMessage?.messageId || `user-${turnId}`,
      assistantMessageIds: turnMessages.filter((message) => message.role === 'assistant').map((message) => message.messageId),
      startedAt: 1, ...(completedTurnIds.has(turnId) ? { finishedAt: 3 } : {}),
    };
  });
  return { sessionId: SESSION_ID, branch: { ...BRANCH, leafMessageId: messages.at(-1)?.messageId || null }, turns, messages, nextCursor };
};
const load = (readPage) => loadAssistContext({ readPage, signal: new AbortController().signal });

describe('session assist canonical context', () => {
  it('stops at three completed turns and excludes tool and system content', async () => {
    const records = [...pair(1), ...pair(2), ...pair(3), ...pair(4)];
    records.at(-1).parts.push({ type: 'tool_call', partId: 'tool-4', toolCallId: 'call-4', toolName: 'bash', input: {} });
    records.splice(4, 0, system('system-2', 'internal context', 'turn-2'));
    const context = await load(async ({ limit }) => {
      expect(limit).toBe(50);
      return page(records);
    });
    expect(context.turns.map((turn) => turn.user.id)).toEqual(['u2', 'u3', 'u4']);
    expect(context.last.text).toBe('answer 4');
    expect(JSON.stringify(context)).not.toContain('internal context');
  });

  it('assembles older canonical pages before the current page', async () => {
    const older = [...pair(1), ...pair(2)];
    const current = [...pair(3), ...pair(4)];
    const context = await load(async ({ cursor }) => cursor ? page(older) : page(current, 'older'));
    expect(context.last.id).toBe('a4');
    expect(context.turns.map((turn) => turn.user.id)).toEqual(['u2', 'u3', 'u4']);
  });

  it('returns null when the newest canonical turn is incomplete', async () => {
    const messages = [...pair(1), ...pair(2)];
    expect(await load(async () => page(messages, null, new Set(['turn-1'])))).toBeNull();
  });

<<<<<<< HEAD
  it('does not expose canonical system records as user prompt context', async () => {
    const messages = [...pair(1), system('system-1', 'internal summary', 'turn-1')];
    const context = await load(async () => page(messages));
    expect(context.last.id).toBe('a1');
    expect(JSON.stringify(context)).not.toContain('internal summary');
||||||| bc50ba56aa
  it('folds an attached synthetic into the user message it belongs to', async () => {
    // v1 carried an attachment as a synthetic part of the user message; v2
    // sends it as its own turn just before the prompt.
    const attachment = synthetic('s', 'Serialized attachment', {
      metadata: { openchamberContext: { kind: 'chat-quote', quote: 'English quoted source', text: 'Виправ саме це' } },
    });
    const context = await load(async () => page([attachment, user('u', 'Fix it'), assistant('a', 'Done')]));
    expect(context.turns).toHaveLength(1);
    expect(context.turns[0].user.text).toContain('> English quoted source');
    expect(context.turns[0].user.text).toContain('User comment:\nВиправ саме це');
    expect(context.turns[0].user.text).toContain('Fix it');
    expect(context.turns[0].user.authored).toContain('Виправ саме це');
  });

  it('reads a linked item as context, never as the user\'s own words, for the current link kinds and the legacy ones', async () => {
    for (const kind of ['repository-issue', 'change-request', 'tracker-item', 'github-issue', 'linear-issue']) {
      const link = user('u', `Linked ${kind}: ENG-12 Search`, { metadata: { openchamberContext: { kind } } });
      const context = await load(async () => page([link, assistant('a', 'Done')]));
      expect(context.turns[0].user.text, kind).toContain(`Linked ${kind}: ENG-12 Search`);
      // The authored text is the language sample; a linked item's title is not one.
      expect(context.turns[0].user.authored, kind).not.toContain('ENG-12');
    }
  });

  it('retains the comment after a large quote and the conclusion after a long answer', async () => {
    const attachment = synthetic('s', 'attachment', {
      metadata: {
        openchamberContext: { kind: 'browser-annotation', prompt: 'x'.repeat(30_000), text: 'USER_REQUEST_END' },
      },
    });
    const context = await load(async () => page([
      attachment,
      user('u', 'Look at this'),
      assistant('a', `START${'x'.repeat(30_000)}CONCLUSION`),
    ]));
    expect(context.turns[0].user.text).toContain('USER_REQUEST_END');
    expect(context.last.text).toMatch(/^START/);
    expect(context.last.text).toMatch(/CONCLUSION$/);
    expect(context.last.text.length).toBeLessThanOrEqual(16_000);
  });

  it('fails explicitly on malformed annotation text instead of losing the comment', async () => {
    const attachment = synthetic('s', 'attachment', {
      metadata: { openchamberContext: { kind: 'chat-quote', quote: 'source', text: 42 } },
    });
    await expect(load(async () => page([attachment, user('u', 'Fix'), assistant('a', 'done')]))).rejects.toThrow();
  });

  it('does not treat a failed or repeated page as complete history', async () => {
    await expect(load(async () => ({ data: undefined }))).rejects.toThrow('unavailable');
    await expect(load(async () => page(pair(1), 'repeated'))).rejects.toThrow('no progress');
    let calls = 0;
    await expect(load(async () => {
      if (++calls === 2) throw new Error('offline');
      return page(pair(1), 'next');
    })).rejects.toThrow('offline');
  });

  it('bounds retrieval and refuses to invent a user for an orphaned answer', async () => {
    let calls = 0;
    const context = await load(async () => page([assistant(`a${++calls}`, 'answer')], `cursor${calls}`));
    expect(calls).toBe(8);
    expect(context).toBeNull();
  });

  it('looks past the idle marker that closes a finished turn', async () => {
    // The ordinary v2 transcript: answer, then `idle`, possibly followed by a
    // switch the user made afterwards. The answer is still the last message.
    for (const tail of [[idle('i')], [idle('i'), modelSwitch('m')], [modelSwitch('m'), idle('i')]]) {
      const context = await load(async () => page([...pair(1), ...tail]));
      expect(context?.last.id).toBe('a1');
      expect(context.turns).toHaveLength(1);
      expect(context.turns[0].assistant.id).toBe('a1');
    }
  });

  it('keeps an attachment glued to its prompt across a switch, and a turn across an idle', async () => {
    const attachment = synthetic('s', 'Attached note');
    const context = await load(async () => page([
      ...pair(1), idle('i1'),
      attachment, modelSwitch('m'), user('u2', 'Use the note'), assistant('a2', 'Used'), idle('i2'),
    ]));
    expect(context.turns.map((turn) => turn.user.id)).toEqual(['u1', 'u2']);
    expect(context.turns[1].user.text).toBe('Attached note\n\nUse the note');
    expect(context.turns[0].complete).toBe(true);
  });

  it('treats a failed or interrupted idle as evidence the turn did not finish', async () => {
    for (const outcome of ['failed', 'interrupted']) {
      expect(await load(async () => page([...pair(1), idle('i', outcome)]))).toBeNull();
    }
  });

  it('keeps paging when a page holds only service records', async () => {
    const context = await load(async ({ cursor }) => (cursor
      ? page([...pair(1)])
      : page([idle('i1'), modelSwitch('m'), idle('i2')], 'older')));
    expect(context?.last.id).toBe('a1');
  });

  it('names the newest content record of a newest-first page', () => {
    expect(newestContentId([idle('i'), modelSwitch('m'), assistant('a', 'x'), user('u', 'y')])).toBe('a');
    expect(newestContentId([idle('i', 'failed'), assistant('a', 'x')])).toBe('i');
    expect(newestContentId([idle('i')])).toBeNull();
    expect(newestContentId(undefined)).toBeNull();
  });

  it('skips unfinished, failed, compaction, and user tails', async () => {
    for (const tail of [
      user('tail', 'New request'),
      assistant('tail', 'Working', { finish: 'tool-calls' }),
      assistant('tail', 'Failed', { error: { type: 'APIError', message: 'boom' } }),
      { id: 'tail', type: 'compaction', status: 'completed', summary: 'Summary' },
    ]) expect(await load(async () => page([...pair(1), tail]))).toBeNull();
=======
  it('folds an attached synthetic into the user message it belongs to', async () => {
    // v1 carried an attachment as a synthetic part of the user message; v2
    // sends it as its own turn just before the prompt.
    const attachment = synthetic('s', 'Serialized attachment', {
      metadata: { openchamberContext: { kind: 'chat-quote', quote: 'English quoted source', text: 'Виправ саме це' } },
    });
    const context = await load(async () => page([attachment, user('u', 'Fix it'), assistant('a', 'Done')]));
    expect(context.turns).toHaveLength(1);
    expect(context.turns[0].user.text).toContain('> English quoted source');
    expect(context.turns[0].user.text).toContain('User comment:\nВиправ саме це');
    expect(context.turns[0].user.text).toContain('Fix it');
    expect(context.turns[0].user.authored).toContain('Виправ саме це');
  });

  it('reads a linked item as context, never as the user\'s own words, for the current link kinds and the legacy ones', async () => {
    for (const kind of ['repository-issue', 'change-request', 'tracker-item', 'github-issue', 'linear-issue']) {
      const link = user('u', `Linked ${kind}: ENG-12 Search`, { metadata: { openchamberContext: { kind } } });
      const context = await load(async () => page([link, assistant('a', 'Done')]));
      expect(context.turns[0].user.text, kind).toContain(`Linked ${kind}: ENG-12 Search`);
      // The authored text is the language sample; a linked item's title is not one.
      expect(context.turns[0].user.authored, kind).not.toContain('ENG-12');
    }
  });

  it('retains the comment after a large quote and the conclusion after a long answer', async () => {
    const attachment = synthetic('s', 'attachment', {
      metadata: {
        openchamberContext: { kind: 'browser-annotation', prompt: 'x'.repeat(30_000), text: 'USER_REQUEST_END' },
      },
    });
    const context = await load(async () => page([
      attachment,
      user('u', 'Look at this'),
      assistant('a', `START${'x'.repeat(30_000)}CONCLUSION`),
    ]));
    expect(context.turns[0].user.text).toContain('USER_REQUEST_END');
    expect(context.last.text).toMatch(/^START/);
    expect(context.last.text).toMatch(/CONCLUSION$/);
    expect(context.last.text.length).toBeLessThanOrEqual(16_000);
  });

  it.each(['quote', 'text', 'fileLabel', 'label', 'pageUrl', 'terminalLabel'])('fails explicitly on malformed attachment %s', async (field) => {
    const attachment = synthetic('s', 'attachment', {
      metadata: { openchamberContext: { kind: 'chat-quote', quote: 'source', [field]: 42 } },
    });
    await expect(load(async () => page([attachment, user('u', 'Fix'), assistant('a', 'done')]))).rejects.toThrow();
  });

  it.each(['comment', 'preview', 'path'])('fails explicitly on malformed OpenCode comment %s', async (field) => {
    const attachment = synthetic('s', 'attachment', {
      metadata: { opencodeComment: { comment: 'Fix this', [field]: 42 } },
    });
    await expect(load(async () => page([attachment, user('u', 'Fix'), assistant('a', 'done')]))).rejects.toThrow();
  });

  it('does not treat a failed or repeated page as complete history', async () => {
    await expect(load(async () => ({ data: undefined }))).rejects.toThrow('unavailable');
    await expect(load(async () => page(pair(1), 'repeated'))).rejects.toThrow('no progress');
    let calls = 0;
    await expect(load(async () => {
      if (++calls === 2) throw new Error('offline');
      return page(pair(1), 'next');
    })).rejects.toThrow('offline');
  });

  it('bounds retrieval and refuses to invent a user for an orphaned answer', async () => {
    let calls = 0;
    const context = await load(async () => page([assistant(`a${++calls}`, 'answer')], `cursor${calls}`));
    expect(calls).toBe(8);
    expect(context).toBeNull();
  });

  it('looks past the idle marker that closes a finished turn', async () => {
    // The ordinary v2 transcript: answer, then `idle`, possibly followed by a
    // switch the user made afterwards. The answer is still the last message.
    for (const tail of [[idle('i')], [idle('i'), modelSwitch('m')], [modelSwitch('m'), idle('i')]]) {
      const context = await load(async () => page([...pair(1), ...tail]));
      expect(context?.last.id).toBe('a1');
      expect(context.turns).toHaveLength(1);
      expect(context.turns[0].assistant.id).toBe('a1');
    }
  });

  it('keeps an attachment glued to its prompt across a switch, and a turn across an idle', async () => {
    const attachment = synthetic('s', 'Attached note');
    const context = await load(async () => page([
      ...pair(1), idle('i1'),
      attachment, modelSwitch('m'), user('u2', 'Use the note'), assistant('a2', 'Used'), idle('i2'),
    ]));
    expect(context.turns.map((turn) => turn.user.id)).toEqual(['u1', 'u2']);
    expect(context.turns[1].user.text).toBe('Attached note\n\nUse the note');
    expect(context.turns[0].complete).toBe(true);
  });

  it('treats a failed or interrupted idle as evidence the turn did not finish', async () => {
    for (const outcome of ['failed', 'interrupted']) {
      expect(await load(async () => page([...pair(1), idle('i', outcome)]))).toBeNull();
    }
  });

  it('keeps paging when a page holds only service records', async () => {
    const context = await load(async ({ cursor }) => (cursor
      ? page([...pair(1)])
      : page([idle('i1'), modelSwitch('m'), idle('i2')], 'older')));
    expect(context?.last.id).toBe('a1');
  });

  it('names the newest content record of a newest-first page', () => {
    expect(newestContentId([idle('i'), modelSwitch('m'), assistant('a', 'x'), user('u', 'y')])).toBe('a');
    expect(newestContentId([idle('i', 'failed'), assistant('a', 'x')])).toBe('i');
    expect(newestContentId([idle('i')])).toBeNull();
    expect(newestContentId(undefined)).toBeNull();
  });

  it('skips unfinished, failed, compaction, and user tails', async () => {
    for (const tail of [
      user('tail', 'New request'),
      assistant('tail', 'Working', { finish: 'tool-calls' }),
      assistant('tail', 'Failed', { error: { type: 'APIError', message: 'boom' } }),
      { id: 'tail', type: 'compaction', status: 'completed', summary: 'Summary' },
    ]) expect(await load(async () => page([...pair(1), tail]))).toBeNull();
>>>>>>> upstream/main
  });

  it('keeps both sides of the newest exchange within a small model budget', async () => {
    const context = await load(async () => page([
      ...pair(1), ...pair(2), user('latest', `REQUEST_START${'u'.repeat(8000)}REQUEST_END`, 'turn-latest'),
      assistant('answer', `ANSWER_START${'a'.repeat(16000)}ANSWER_END`, 'turn-latest'),
    ]));
    for (const budget of [1_000, 4_000, 14_000, 32_000, 1_000_000]) {
      const prompt = buildAssistPrompt(context.turns, { recap: true, suggestion: true }, budget);
      expect(prompt.text.length).toBeLessThanOrEqual(Math.min(budget, 32_000));
      for (const marker of ['REQUEST_START', 'REQUEST_END', 'ANSWER_START', 'ANSWER_END']) expect(prompt.text).toContain(marker);
    }
    expect(buildAssistPrompt(context.turns, { recap: true }, 500)).toBeNull();
  });

  it('names the newest content record of a chronological HistoryPage', () => {
    const records = [...pair(1), system('system-1', 'internal', 'turn-1')];
    expect(newestContentId(records)).toBe('a1');
    expect(newestContentId([system('system-1', 'internal', 'turn-1')])).toBeNull();
    expect(newestContentId(undefined)).toBeNull();
  });

  it('refuses an unanswered canonical tail', async () => {
    const messages = [...pair(1), user('tail', 'new request', 'turn-tail')];
    expect(await load(async () => page(messages, null, new Set(['turn-1'])))).toBeNull();
  });

  it('bounds retrieval when pages contain only canonical system records', async () => {
    let calls = 0;
    const context = await load(async ({ cursor }) => {
      calls++;
      return cursor
        ? page([system(`system-${calls}`, 'internal', `turn-system-${calls}`)], `cursor-${calls}`)
        : page([system('system-1', 'internal', 'turn-system-1')], 'cursor-1');
    });
    expect(calls).toBe(8);
    expect(context).toBeNull();
  });

  it('reads settled turns before a newly sent message', async () => {
    const signal = new AbortController().signal;
    const messages = [...pair(1), ...pair(2), ...pair(3), user('new', 'fresh request', 'turn-new')];
    const turns = await loadSettledTurns({ signal, readPage: async () => page(messages, null, new Set(['turn-1', 'turn-2', 'turn-3'])) });
    expect(turns.map((turn) => turn.user.id)).toEqual(['u1', 'u2', 'u3']);
    expect(await loadSettledTurns({ signal, readPage: async () => page([user('only', 'first message', 'turn-only')], null, new Set()) })).toEqual([]);
  });

  it('keeps paging until three settled canonical turns are found', async () => {
    let calls = 0;
    const turns = await loadSettledTurns({
      signal: new AbortController().signal,
      readPage: async ({ cursor }) => {
        calls++;
        return cursor
          ? page([...pair(1), ...pair(2)])
          : page([...pair(3), user('new', 'fresh request', 'turn-new')], 'older', new Set(['turn-3']));
      },
    });
    expect(calls).toBe(2);
    expect(turns.map((turn) => turn.user.id)).toEqual(['u1', 'u2', 'u3']);
  });

  it('fails explicitly on an unavailable history page', async () => {
    await expect(loadSettledTurns({ signal: new AbortController().signal, readPage: async () => ({}) })).rejects.toThrow();
  });

  it('excerpts from both ends', () => {
    expect(excerpt('abcdef', 10)).toBe('abcdef');
    const trimmed = excerpt(`START${'x'.repeat(500)}END`, 100);
    expect(trimmed.length).toBeLessThanOrEqual(100);
    expect(trimmed).toMatch(/^START/);
    expect(trimmed).toMatch(/END$/);
  });
});
