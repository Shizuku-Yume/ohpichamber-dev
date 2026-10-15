import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import type { HistoryPage, Message, Turn } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import * as runtime from '@/lib/runtime-switch';
import { loadLaneFirstPrompt, loadLaneLastTurn, loadLaneTurnModel } from './laneData';

const spies: Array<{ mockRestore(): void }> = [];
afterEach(() => { for (const spy of spies.splice(0)) spy.mockRestore(); });
const branch = { branchId: 'branch', branchVersion: '1', leafMessageId: null };
const message = (messageId: string, role: Message['role'], content: string, turnId = 'turn'): Message => ({
  messageId, sessionId: 'session', turnId, role, createdAt: 1,
  parts: content ? [{ type: 'text', partId: `part_${messageId}`, content }] : [],
});
const turn = (status: Turn['status'] = 'completed'): Turn => ({
  turnId: 'turn', sessionId: 'session', runId: 'run', status, userMessageId: 'user',
  assistantMessageIds: ['answer'], startedAt: 1, finishedAt: 20,
});
const page = (messages: Message[], turns: Turn[] = [], nextCursor: string | null = null): HistoryPage => ({
  sessionId: 'session', branch, messages, turns, nextCursor,
});
function pages(values: HistoryPage[]) {
  const spy = spyOn(canonicalClient, 'getHistory').mockImplementation(async (_sessionId, request) => {
    const index = request?.cursor ? Number(request.cursor) : 0;
    return values[index];
  });
  spies.push(spy);
  return spy;
}

describe('canonical lane history', () => {
  test('first prompt searches chronological pages and retains native attachments', async () => {
    const attachment = { attachmentId: 'file', name: 'file.txt', mediaType: 'text/plain', size: 4, uri: 'attachment:file' };
    const user = message('user', 'user', 'question');
    user.parts.push({ type: 'attachment', partId: 'filepart', ...attachment });
    const spy = pages([page([message('system', 'system', 'context')], [], '1'), page([user])]);
    expect(await loadLaneFirstPrompt('session')).toEqual({ messageId: 'user', turnId: 'turn', text: 'question', files: [attachment] });
    expect(spy.mock.calls[1][1]?.cursor).toBe('1');
  });
  test('latest reply follows more than one hundred pages without truncating history', async () => {
    const values = Array.from({ length: 102 }, (_, index) => page(
      [message(`answer_${index}`, 'assistant', `reply ${index}`)],
      index === 101 ? [turn()] : [], index === 101 ? null : String(index + 1),
    ));
    const spy = pages(values);
    expect(await loadLaneLastTurn('session')).toEqual({ text: 'reply 101', error: null, status: 'completed', cost: null, finishedAt: 20 });
    expect(spy.mock.calls.length).toBe(102);
  });
  test('failed tool-only latest turn preserves previous text and native usage', async () => {
    const assistant = message('answer', 'assistant', 'last useful text');
    assistant.usage = { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3,
      cost: { input: 0.1, output: 0.2, cacheRead: 0, cacheWrite: 0, total: 0.3 } };
    const failure = { ...turn('failed'), turnId: 'failed', error: 'Engine failed', finishedAt: 30 };
    pages([page([assistant], [turn()], '1'), page([message('empty', 'assistant', '', 'failed')], [failure])]);
    expect(await loadLaneLastTurn('session')).toEqual({ text: 'last useful text', error: 'Engine failed', status: 'failed', cost: 0.3, finishedAt: 30 });
  });
  test('a cancelled turn without an assistant message remains cancelled', async () => {
    pages([page([], [turn('cancelled')])]);
    expect((await loadLaneLastTurn('session')).status).toBe('cancelled');
  });
  test('comparison resolves original turn model rather than newest snapshot model', async () => {
    pages([page([message('system', 'system', '')], [], '1'), page([
      { ...message('original', 'assistant', 'first', 'first'), providerId: 'original', modelId: 'first-model' },
      { ...message('later', 'assistant', 'last', 'later'), providerId: 'later', modelId: 'last-model' },
    ])]);
    expect(await loadLaneTurnModel('session', 'first')).toEqual({ providerId: 'original', modelId: 'first-model' });
  });
  test('branch changes and history failures never become empty successful replies', async () => {
    pages([page([], [], '1'), { ...page([]), branch: { ...branch, branchVersion: '2' } }]);
    await expect(loadLaneLastTurn('session')).rejects.toThrow('History branch changed');
  });
  test('native read failures propagate', async () => {
    spies.push(spyOn(canonicalClient, 'getHistory').mockRejectedValue(new Error('History failed')));
    await expect(loadLaneFirstPrompt('session')).rejects.toThrow('History failed');
    await expect(loadLaneLastTurn('session')).rejects.toThrow('History failed');
  });
  test('runtime changes stop paging before another request', async () => {
    let key = 'first';
    spies.push(spyOn(runtime, 'getRuntimeKey').mockImplementation(() => key));
    const spy = spyOn(canonicalClient, 'getHistory').mockImplementation(async () => { key = 'next'; return page([], [], '1'); });
    spies.push(spy);
    await expect(loadLaneLastTurn('session')).rejects.toThrow('Runtime changed');
    expect(spy.mock.calls.length).toBe(1);
  });
});
