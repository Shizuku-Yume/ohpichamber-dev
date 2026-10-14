import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Message, Model, Turn } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { collectNativeTitleTurns } from '@/sync/session-title-context';
import { invalidateSettingsCache } from './persistence';
import { switchRuntimeEndpoint } from './runtime-switch';
import { formatSessionTitleContext, generatedSessionTitleSchema, generateSessionTitle } from './sessionTitle';

const message = (id: string, role: 'user' | 'assistant', turnId: string, content: string): Message => {
  const result: Message = {
    messageId: id, sessionId: 'session-a', turnId, role, createdAt: 1,
    parts: [{ type: 'text', partId: `${id}-text`, content }],
  };
  if (role === 'assistant') {
    result.providerId = 'provider';
    result.modelId = 'model';
  }
  return result;
};
const pair = (id: string) => ({
  user: message(`${id}-user`, 'user', id, `Question ${id}`),
  assistant: message(`${id}-answer`, 'assistant', id, `Answer ${id}`),
});
const turn = (id: string, status: Turn['status'] = 'completed'): Turn => ({ turnId: id, sessionId: 'session-a', runId: 'run-a', status, userMessageId: `${id}-user`, assistantMessageIds: [`${id}-answer`], startedAt: 1, finishedAt: 2 });
const model: Model = { provider: 'provider', modelId: 'model', name: 'Model', modalities: ['text'], contextWindow: 8000, maxOutputTokens: 2000, reasoningEffortSupported: false, reasoningOptions: [], variants: [], pricing: null };
let restorers: Array<() => void>;
beforeEach(() => {
  switchRuntimeEndpoint({ apiBaseUrl: 'https://title.test', runtimeKey: `title-${crypto.randomUUID()}` });
  invalidateSettingsCache();
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({}));
  const catalog = spyOn(canonicalClient, 'getModels').mockImplementation(async workspaceId => ({ workspaceId, revision: '0', models: [model] }));
  restorers = [() => fetcher.mockRestore(), () => catalog.mockRestore()];
});
afterEach(() => { for (const restore of restorers.reverse()) restore(); invalidateSettingsCache(); });

describe('native title context', () => {
  test('uses the last three completed native turns, never failed or running turns', () => {
    const ids = ['old', 'one', 'two', 'three', 'running', 'failed'];
    const messages = ids.flatMap(id => Object.values(pair(id)));
    const turns = ids.map(id => turn(id, id === 'running' ? 'running' : id === 'failed' ? 'failed' : 'completed'));
    const collected = collectNativeTitleTurns(messages, turns);
    expect(collected.map(item => item.user.turnId)).toEqual(['one', 'two', 'three']);
    expect(formatSessionTitleContext(collected)).not.toContain('running');
    expect(collectNativeTitleTurns(messages, turns, 'two-user').map(item => item.user.turnId)).toEqual(['old', 'one']);
    expect(collectNativeTitleTurns(messages, turns, 'not-loaded')).toEqual([]);
  });
  test('bounds large text and excludes reasoning/tool output while retaining attachments', () => {
    const first = pair('one');
    first.user.parts = [{ type: 'attachment', partId: 'attachment-part', attachmentId: 'attachment-a', name: 'large.ts', mediaType: 'text/plain', size: 10, uri: 'attachment://attachment-a' }];
    first.assistant.parts.push({ type: 'reasoning', partId: 'thought', content: 'Private reasoning noise' });
    const big = pair('two');
    big.user.parts[0] = { type: 'text', partId: 'big-user', content: 'x'.repeat(100_000) };
    big.assistant.parts[0] = { type: 'text', partId: 'big-answer', content: 'y'.repeat(100_000) };
    const context = formatSessionTitleContext([first, big]);
    expect(context).toContain('large.ts');
    expect(context).not.toContain('Private reasoning noise');
    expect(context.length).toBeLessThan(16_500);
    expect(context).toContain('[Content omitted]');
  });
  test('retains established title cleanup, rejects empty output and caps long titles', () => {
    expect(generatedSessionTitleSchema.parse({ text: '\n<think>Noise</think>\nНова назва\nExplanation' })).toBe('Нова назва');
    expect(generatedSessionTitleSchema.parse({ text: 'н'.repeat(101) })).toBe('н'.repeat(97) + '...');
    for (const text of ['', '  ', '<think>Only reasoning</think>']) expect(() => generatedSessionTitleSchema.parse({ text })).toThrow();
  });
});

describe('native title completion', () => {
  test('uses the prepared workspace and last assistant provider without a session generation fallback', async () => {
    const resolve = spyOn(canonicalClient, 'resolveWorkspace');
    const complete = spyOn(canonicalClient, 'complete').mockImplementation(async (workspaceId, input) => {
      expect(workspaceId).toBe('workspace-prepared');
      expect(input.selection).toEqual({ providerId: 'provider', modelId: 'model' });
      expect(input.prompt).toContain('Question one');
      return { completionId: input.completionId, selection: input.selection, status: 'completed', output: { kind: 'text', text: 'A useful title' }, finishReason: 'complete', usage: null };
    });
    restorers.push(() => resolve.mockRestore(), () => complete.mockRestore());
    expect(await generateSessionTitle({ turns: [pair('one')], directory: '/repo', workspaceId: 'workspace-prepared', signal: new AbortController().signal })).toBe('A useful title');
    expect(resolve).not.toHaveBeenCalled();
  });
  test('provider failure cannot become a title and empty context dispatches nothing', async () => {
    const complete = spyOn(canonicalClient, 'complete').mockImplementation(async (_workspace, input) => ({ completionId: input.completionId, selection: input.selection, status: 'failed', error: { code: 'PROVIDER_FAILURE', detail: 'Provider refused', retryable: false } }));
    restorers.push(() => complete.mockRestore());
    const input = { directory: '/repo', workspaceId: 'workspace-prepared', signal: new AbortController().signal };
    await expect(generateSessionTitle({ ...input, turns: [pair('one')] })).rejects.toThrow('Provider refused');
    await expect(generateSessionTitle({ ...input, turns: [] })).rejects.toThrow('No completed turns');
    expect(complete).toHaveBeenCalledTimes(1);
  });
  test('missing target message selection never redirects generation to the composer', async () => {
    const complete = spyOn(canonicalClient, 'complete');
    restorers.push(() => complete.mockRestore());
    const source = pair('one');
    delete source.assistant.providerId;
    delete source.assistant.modelId;
    await expect(generateSessionTitle({ turns: [source], directory: '/repo', workspaceId: 'workspace-prepared', signal: new AbortController().signal })).rejects.toThrow('Completed turn model selection is unavailable');
    expect(complete).not.toHaveBeenCalled();
  });
});
