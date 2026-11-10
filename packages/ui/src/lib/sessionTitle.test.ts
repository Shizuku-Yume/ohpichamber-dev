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
  const catalog = spyOn(canonicalClient, 'getModels').mockImplementation(async workspaceId => ({ workspaceId, revision: '0', models: [model], defaults: { model: null, thinkingLevel: null }, imageModels: [], planRoleAvailable: false }));
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

<<<<<<< HEAD
describe('native title completion', () => {
  test('uses the prepared workspace and last assistant provider without a session generation fallback', async () => {
    const resolve = spyOn(canonicalClient, 'resolveWorkspace');
    const complete = spyOn(canonicalClient, 'complete').mockImplementation(async (workspaceId, input) => {
      expect(workspaceId).toBe('workspace-prepared');
      expect(input.selection).toEqual({ providerId: 'provider', modelId: 'model' });
      expect(input.prompt).toContain('Question one');
      expect(input.prompt.startsWith('**Current title:** Keep me\n\n---\n\n')).toBe(true);
      return { completionId: input.completionId, selection: input.selection, status: 'completed', output: { kind: 'text', text: 'A useful title' }, finishReason: 'complete', usage: null };
=======
describe('Markdown export of attached context', () => {
  test('exports quote and reply exactly once with paragraph separation, including child sessions', () => {
    const record = user('one', [textPart('My request'), contextPart({ kind: 'file-quote', fileLabel: 'plan.md', startLine: 2, endLine: 4, quote: 'First line\n\nLast line', text: 'My comment' })]);
    const output = formatSessionAsMarkdown([record], 'Title', [{ title: 'Child', records: [record], children: [] }]);
    expect(output).toContain('My request\n\nQuoted from `plan.md`, lines 2-4:');
    expect(output).toContain('> First line\n> \n> Last line\n\n**User comment:**\n\nMy comment');
    expect(output.match(/My comment/g)).toHaveLength(2);
    expect(output).not.toContain('Comment on this fragment');
  });

  test('formats browser, PR, code and terminal contexts without mixing comments into quotes', () => {
    const contexts: ContextPartPayload[] = [
      { kind: 'browser-annotation', pageUrl: 'https://example.com', prompt: 'Button', text: 'Move it' },
      { kind: 'pr-comment', label: '#7 review', body: 'Reviewer comment', text: 'Agreed' },
      { kind: 'pr-check', label: 'CI', output: 'Build failed', text: 'Fix build' },
      { kind: 'code-comment', source: 'diff', fileLabel: 'app.ts', startLine: 1, endLine: 2, side: 'modified', language: 'ts', code: 'const x = 1;', text: 'Change x' },
      { kind: 'terminal', terminalId: 'term', terminalLabel: 'Shell', startLine: 1, endLine: 1, output: 'Log output' },
    ];
    const output = formatMessageText(contexts.map(contextPart), { user: true });
    for (const content of ['Button', 'Reviewer comment', 'Build failed', 'const x = 1;', 'Log output']) expect(output).toContain(`> ${content}`);
    for (const comment of ['Move it', 'Agreed', 'Fix build', 'Change x']) expect(output).toContain(`**User comment:**\n\n${comment}`);
    expect(output).not.toContain('<terminal_context>');
    expect(output).toContain('> ```ts\n> const x = 1;\n> ```');
  });

  test('preserves legacy terminal context and malformed metadata as readable text', () => {
    const output = formatMessageText([
      textPart('Check this\n\n<terminal_context>\n- Shell lines 1-1:\n  1 | failure\n</terminal_context>'),
      { ...textPart('Legacy comment'), metadata: { openchamberContext: { kind: 'broken' } } },
    ], { user: true });
    expect(output).toContain('> failure');
    expect(output).toContain('Check this');
    expect(output).toContain('Legacy comment');
  });
});

describe('bounded history loading', () => {
  test('uses the real shared loader and stops paging as soon as three pairs are available', async () => {
    let requests = 0;
    const childStores = new ChildStoreManager();
    // Records that go through a child store come back ordered by creation
    // time, so this fixture stamps each pair with its own slot.
    const orderedPair = (ordinal: number, id: string): RecordEntry[] => {
      const created = ordinal * 10;
      const prompt = user(id);
      return [
        { ...prompt, info: { id: `msg_${ordinal}_1`, sessionID: 'session', role: 'user', time: { created } } },
        assistant(id, { id: `msg_${ordinal}_2`, time: { created: created + 1, completed: created + 2 } }),
      ];
    };
    // v2 pages messages newest-first through the loader's page source rather
    // than through an HTTP client, so the fake returns pages directly.
    const sdk: SessionMessagePageSource = {
      getSessionMessages: async () => {
        requests += 1;
        return {
          items: requests === 1 ? orderedPair(3, 'three') : [...orderedPair(1, 'one'), ...orderedPair(2, 'two')],
          cursor: { next: requests === 1 ? 'older' : 'much-older' },
        };
      },
    };
    const loader = new SessionMessageLoader(childStores, { sdk, runtimeKey: 'test' });
    const target = { sessionID: 'session', directory: '/project' };
    const release = loader.retainSessionHistory(target);
    try {
      const turns = await loadSessionTitleTurns({
        loader, target, signal: new AbortController().signal,
        getRecords: () => {
          const state = childStores.getChild('/project')?.getState();
          return (state?.message.session ?? []).map((info) => ({ info, parts: state?.part[info.id] ?? [] }));
        },
      });
      expect(turns).toHaveLength(3);
      expect(requests).toBe(2);
      expect(loader.getSnapshot(target).complete).toBe(false);
    } finally { release(); loader.dispose(); childStores.disposeAll(); }
  });

  test('does not use cached partial turns when the authoritative loader failed', async () => {
    const error = new Error('offline');
    const loader = {
      ensure: async () => {}, loadOlder: async () => {},
      getSnapshot: (): ReturnType<SessionMessageLoader['getSnapshot']> => ({ status: 'error', loadingKind: null, error, resolved: true, limit: 50, cursor: 'older', complete: false, generation: 0, updatedAt: 1, olderCompletedReplyIds: new Set() }),
    };
    await expect(loadSessionTitleTurns({ loader, target: { sessionID: 'session', directory: '/project' }, getRecords: () => pair('cached'), signal: new AbortController().signal })).rejects.toThrow('offline');
  });

  test('an explicit retry refreshes a failed loader even when older messages remain cached', async () => {
    let state: ReturnType<SessionMessageLoader['getSnapshot']> = {
      status: 'error', loadingKind: null, error: new Error('offline'), resolved: true,
      limit: 50, cursor: undefined, complete: true, generation: 0, updatedAt: 1,
      olderCompletedReplyIds: new Set(),
    };
    const loader = {
      ensure: async (_target: { directory: string; sessionID: string }, options?: { force?: boolean }) => {
        expect(options?.force).toBe(true);
        state = { ...state, status: 'ready', error: null, generation: 1 };
      },
      loadOlder: async () => {},
      getSnapshot: () => state,
    };
    const turns = await loadSessionTitleTurns({ loader, target: { sessionID: 'session', directory: '/project' }, getRecords: () => pair('recovered'), signal: new AbortController().signal });
    expect(turns).toHaveLength(1);
  });
});

describe('generation lifecycle', () => {
  const turns = collectSessionTitleTurns(pair('one'));
  test('calls the existing Small Model route with the target directory and provider', async () => {
    let calls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      expect(new URL(request.url).pathname).toBe('/api/small-model/generate');
      expect(request.method).toBe('POST');
      const body = await request.json();
      expect(body).toMatchObject({
        directory: '/project', preferredProviderID: 'provider', preferredModelID: 'model', restrictToPreferredProvider: true,
      });
      const { prompt } = z.object({ prompt: z.string() }).parse(body);
      expect(prompt.startsWith('**Current title:** Original\n\n---\n\n**User**')).toBe(true);
      const { system } = z.object({ system: z.string() }).parse(body);
      expect(system).toContain('only the user message decides the language');
      expect(system).toContain('Most titles are two or three words');
      expect(system).toContain('Leave out the name of the project');
      expect(system).toContain('检查项目的 git 记录和未完成的计划 → 项目进度检查');
      calls += 1;
      return calls === 1 ? Response.json({ text: 'A useful title' }) : new Response('Unavailable', { status: 503 });
    };
    configureRuntimeUrlResolver({ apiBaseUrl: 'http://session-title.test' });
    try {
      const input = { turns, currentTitle: 'Original', directory: '/project', signal: new AbortController().signal };
      expect(await generateSessionTitle(input)).toBe('A useful title');
      await expect(generateSessionTitle(input)).rejects.toThrow('Session title generation failed');
      expect(calls).toBe(2);
    } finally { globalThis.fetch = originalFetch; configureRuntimeUrlResolver({ apiBaseUrl: '' }); }
  });

  test('asks the server inside the space for a session in an isolated space', async () => {
    const paths: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      paths.push(`${new URL(request.url).pathname} ${request.headers.get('x-opencode-directory')}`);
      return Response.json({ text: 'A useful title' });
    };
    configureRuntimeUrlResolver({ apiBaseUrl: 'http://session-title.test' });
    try {
      await generateSessionTitle({ turns, currentTitle: 'Original', directory: '/spaces/a1b2c3d4e5f6/repo', signal: new AbortController().signal });
      expect(paths).toEqual([`/api/small-model/generate ${encodeURIComponent('/spaces/a1b2c3d4e5f6/repo')}`]);
    } finally { globalThis.fetch = originalFetch; configureRuntimeUrlResolver({ apiBaseUrl: '' }); }
  });

  test('saves only after generation and a fresh metadata read', async () => {
    const events: string[] = [];
    await generateAndSaveSessionTitle({
      signal: new AbortController().signal,
      prepare: async () => ({ session, turns }),
      generate: async () => { events.push('generate'); return 'New title'; },
      readSession: async () => { events.push('read'); return session; },
      saveTitle: async (title) => { events.push(title); },
>>>>>>> bc50ba56a
    });
    restorers.push(() => resolve.mockRestore(), () => complete.mockRestore());
    expect(await generateSessionTitle({ turns: [pair('one')], currentTitle: 'Keep me', directory: '/repo', workspaceId: 'workspace-prepared', signal: new AbortController().signal })).toBe('A useful title');
    expect(resolve).not.toHaveBeenCalled();
  });
  test('provider failure cannot become a title and empty context dispatches nothing', async () => {
    const complete = spyOn(canonicalClient, 'complete').mockImplementation(async (_workspace, input) => ({ completionId: input.completionId, selection: input.selection, status: 'failed', error: { code: 'PROVIDER_FAILURE', detail: 'Provider refused', retryable: false } }));
    restorers.push(() => complete.mockRestore());
    const input = { currentTitle: 'Keep me', directory: '/repo', workspaceId: 'workspace-prepared', signal: new AbortController().signal };
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
    await expect(generateSessionTitle({ turns: [source], currentTitle: 'Keep me', directory: '/repo', workspaceId: 'workspace-prepared', signal: new AbortController().signal })).rejects.toThrow('Completed turn model selection is unavailable');
    expect(complete).not.toHaveBeenCalled();
  });
});
