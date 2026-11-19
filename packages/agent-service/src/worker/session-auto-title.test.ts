import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { JsonValueSchema, type PromptRequest, type ProjectionInput } from '@openchamber/agent-contract';
import { resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import { __resetDirsFromEnvForTests } from '@oh-my-pi/pi-utils';
import { WorkerSession } from './session.ts';
import { cfgSuggestionGenerator } from './suggestion.ts';
const directoryEnvironmentKeys = ['HOME', 'USERPROFILE', 'PI_CONFIG_DIR', 'PI_CODING_AGENT_DIR', 'OMP_PROFILE', 'PI_PROFILE', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME'] as const;
let environmentRoot = '';
let previousEnvironment: Array<readonly [string, string | undefined]> = [];
const previousNoTitle = process.env.PI_NO_TITLE;

beforeEach(async () => {
 resetSettingsForTest();
 previousEnvironment = directoryEnvironmentKeys.map(key => [key, process.env[key]] as const);
 for (const key of directoryEnvironmentKeys) delete process.env[key];
 environmentRoot = await mkdtemp(join(tmpdir(), 'native-auto-title-'));
 process.env.HOME = environmentRoot;
 process.env.USERPROFILE = environmentRoot;
 process.env.PI_CONFIG_DIR = '.omp';
 process.env.XDG_DATA_HOME = join(environmentRoot, 'data');
 process.env.XDG_STATE_HOME = join(environmentRoot, 'state');
 process.env.XDG_CACHE_HOME = join(environmentRoot, 'cache');
 // This suite exercises the automatic title itself, so the production path runs.
 delete process.env.PI_NO_TITLE;
 __resetDirsFromEnvForTests();
});
afterEach(async () => {
 resetSettingsForTest();
 if (previousNoTitle === undefined) delete process.env.PI_NO_TITLE;
 else process.env.PI_NO_TITLE = previousNoTitle;
 for (const [key, value] of previousEnvironment) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
 }
 __resetDirsFromEnvForTests();
 await rm(environmentRoot, { recursive: true, force: true });
});

const ProviderRequestSchema = z.object({
 messages: z.array(z.object({ role: z.string(), content: JsonValueSchema }).catchall(JsonValueSchema)),
}).catchall(JsonValueSchema);

const textOf = (content: JsonValue): string => {
 if (typeof content === 'string') return content;
 if (Array.isArray(content)) {
  return content.map(part => (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string' ? part.text : '')).join('');
 }
 return '';
};

/** Which OMP request this is: the foreground prompt, an opening title ask, or the deferred retry. */
const classify = (request: z.infer<typeof ProviderRequestSchema>): 'foreground' | 'title-opening' | 'title-context' => {
 const user = [...request.messages].reverse().find(message => message.role === 'user');
 const text = user ? textOf(user.content) : '';
 if (text.includes('<chat>')) return 'title-context';
 if (text.trimStart().startsWith('<user>')) return 'title-opening';
 return 'foreground';
};

const streamText = (text: string, model = 'native-model'): Response => {
 const chunk = {
  id: 'native-response', object: 'chat.completion.chunk', created: 1, model,
  choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }],
 };
 const finish = { ...chunk, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 } };
 return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(finish)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
};

type TitleAnswers = { opening: string; context: string } | { titlePrompt: (system: string) => Response };

/**
 * Opens a real WorkerSession against a loopback provider that answers the
 * foreground prompt, the opening title request and (optionally) the deferred
 * conversation-context request. `title.answers.opening` may be `none`, OMP's
 * "decline" sentinel, which is what a title model returns for a prompt it
 * cannot name.
 */
async function session(answers: TitleAnswers, firstText: string, onContextRequest?: (worker: WorkerSession) => Promise<void>) {
 const titledByProjection = Promise.withResolvers<string>();
 const requests: Array<{ kind: 'foreground' | 'title-opening' | 'title-context'; text: string; system: string }> = [];
 const events: ProjectionInput[] = [];
 const endpoint = Bun.serve({
  hostname: '127.0.0.1', port: 0, async fetch(request) {
   const payload = ProviderRequestSchema.parse(await request.json());
   const kind = classify(payload);
   const system = payload.messages.filter(message => message.role === 'system' || message.role === 'developer').map(message => textOf(message.content)).join('\n');
   const user = [...payload.messages].reverse().find(message => message.role === 'user');
   requests.push({ kind, text: user ? textOf(user.content) : '', system });
   if (kind === 'foreground') return streamText('已修复统计聚合，并补上并发读取的回归测试。');
   if ('titlePrompt' in answers) {
    // A caller may act while the context request is in flight, e.g. rename.
    if (kind === 'title-context' && onContextRequest && worker) await onContextRequest(worker);
    return answers.titlePrompt(system);
   }
   if (kind === 'title-opening') return streamText(answers.opening);
   // A caller may act while the context request is in flight, e.g. rename.
   if (onContextRequest && worker) await onContextRequest(worker);
   return streamText(answers.context);
  },
 });
 const root = join(environmentRoot, 'workspace');
 const agentDirectory = join(root, 'agent');
 await mkdir(root, { recursive: true });
 await mkdir(agentDirectory, { recursive: true });
 const open = () => WorkerSession.open({
  type: 'bootstrap', rootSessionId: 'title-root', workerGeneration: 'generation',
  projectId: 'project', workspaceId: 'workspace', agentDirectoryId: 'source', cwd: root, agentDirectory,
  mcpConfigPath: join(agentDirectory, 'mcp.json'), sessionsDirectory: join(environmentRoot, 'sessions'),
 }, inputs => {
  events.push(...inputs);
  for (const input of inputs) {
   if (input.event.type === 'session.updated' && input.event.title) titledByProjection.resolve(input.event.title);
  }
 }, () => { throw new Error('No interaction expected'); }, () => { throw new Error('Title work must not fail the worker'); },
  async () => { }, async () => { throw new Error('No Host action expected'); }, () => { });
 const worker = await open();
 cfgSuggestionGenerator.override(worker.session.settings, 'off');
 await worker.operation({
  type: 'catalog', revision: '1', operation: {
   type: 'catalog.provider.configure', request: {
    expectedRevision: '0', configuration: {
     providerId: 'native-fixture', name: 'Native fixture', endpoint: `http://127.0.0.1:${endpoint.port}/v1`,
     protocol: 'chat-completions', credentialRef: null,
    }
   }
  }
 });
 await worker.operation({
  type: 'catalog', revision: '2', operation: {
   type: 'catalog.model.configure', request: {
    expectedRevision: '1', model: {
     modelId: 'native-model', provider: 'native-fixture', name: 'Native model', modalities: ['text'],
     contextWindow: 65536, maxOutputTokens: 128, reasoningEffortSupported: false, reasoningOptions: [],
     variants: [], toolsSupported: true, enabled: true, pricing: null,
    }
   }
  }
 });
 const model = worker.session.modelRegistry.find('native-fixture', 'native-model');
 if (!model) throw new Error('Fixture model is unavailable');
 await worker.session.setModelTemporary(model);
 const prompt: PromptRequest = { input: { text: firstText, context: [], attachments: [] }, options: { providerId: 'native-fixture', modelId: 'native-model', agentId: null, variant: null, reasoningEffort: null } };
 await Promise.race([
  worker.operation({ type: 'prompt', runId: 'title-run', request: prompt }),
  Bun.sleep(5_000).then(() => { throw new Error('prompt admission timed out'); }),
 ]);
 // The browser only learns the title through the worker's projection, so the
 // published `session.updated` is what this test waits for.
 const landed = await Promise.race([titledByProjection.promise, Bun.sleep(8_000).then(() => '')]);
 return { title: landed, name: worker.session.sessionManager.getSessionName(), requests, events, close: async () => { await worker?.close(); await endpoint.stop(true); } };
}

test('a greeting session is titled from its reply after the first turn, with no second prompt', async () => {
 // `hi` is low signal, so OMP makes no opening request at all; the reply is the context.
 const result = await session({ opening: 'none', context: '<title>统计路由修复</title>' }, 'hi');
 try {
  expect(result.title).toBe('统计路由修复');
  expect(result.requests.filter(entry => entry.kind === 'title-context')).toHaveLength(1);
  // The foreground turn's reply is in the context the title model read.
  expect(result.events.some(input => input.event.type === 'message.updated')).toBe(true);
 } finally {
  await result.close();
 }
}, 30_000);

test('a declined opening title retries once from a short reply and still names the session', async () => {
 const result = await session({ opening: 'none', context: '<title>统计聚合修复</title>' }, '看看统计路由');
 try {
  expect(result.title).toBe('统计聚合修复');
  expect(result.requests.filter(entry => entry.kind === 'title-opening')).toHaveLength(1);
  expect(result.requests.filter(entry => entry.kind === 'title-context')).toHaveLength(1);
 } finally {
  await result.close();
 }
}, 30_000);

test('a manual rename is never overwritten by a deferred title that was already generating', async () => {
 // The context request is held until the user renames; the deferred title then
 // arrives after a name exists and must not replace it.
 const result = await session(
  { opening: 'none', context: '<title>Generated name</title>' },
  '看看统计路由',
  async worker => { await worker.operation({ type: 'session.rename', title: 'Manual name' }); },
 );
 try {
  expect(result.name).toBe('Manual name');
  expect(result.title).not.toBe('Generated name');
 } finally {
  await result.close();
 }
}, 30_000);

test('closing the worker aborts an in-flight deferred title instead of publishing it', async () => {
 const result = await session(
  { opening: 'none', context: '<title>Late name</title>' },
  '看看统计路由',
  async worker => {
   // Close while the context request is in flight: no title may land after it.
   await worker.close();
  },
 );
 try {
  expect(result.title).not.toBe('Late name');
  expect(result.name).toBeUndefined();
 } finally {
  await result.close();
 }
}, 30_000);

test('a real CJK greeting still issues the conversation-context request, and a declining model leaves it untitled', async () => {
 // The exact live case: the opening prompt is 你好, the reply is a short
 // workspace notice, and the title model declines both the opening prompt and
 // the context. Both requests must still be made — the deferral is attempted
 // even though the reply is short — and with a declining model the session
 // stays untitled, which is what pinned OMP does (it requires a 40-word reply
 // before retrying at all). A missing attempt here would be the wiring bug.
 const result = await session({ opening: 'none', context: 'none' }, '你好');
 try {
  expect(result.name).toBeUndefined();
  expect(result.title).toBe('');
  expect(result.requests.map(entry => entry.kind)).toEqual(['foreground', 'title-opening', 'title-context']);
  // The opening attempt keeps OMP's own prompt, which declines greetings; the
  // deferred attempt swaps in the conversation-subject prompt instead.
  const openingRequest = result.requests.find(entry => entry.kind === 'title-opening');
  const contextRequest = result.requests.find(entry => entry.kind === 'title-context');
  expect(openingRequest?.system).toContain('Answer `<title/>` for greetings');
  expect(contextRequest?.system).toContain('may not have a task yet');
  expect(contextRequest?.system).not.toContain('Answer `<title/>` for greetings');
  expect(contextRequest?.system.toLowerCase()).toContain('never invent a task');
  // The context carries the operator's greeting and the assistant's answer.
  expect(contextRequest?.text).toContain('<chat>');
  expect(contextRequest?.text).toContain('你好');
  expect(contextRequest?.text).toContain('<assistant>');
 } finally {
  await result.close();
 }
}, 30_000);

test('the deferred prompt makes a greeting-exchange model return a title instead of the greeting decline', async () => {
 // A stand-in title model that honours the prompt it is given: it declines
 // under OMP's default policy and names the exchange under the deferred policy.
 // This is the exact live failure — one 你好 turn, no second prompt.
 const result = await session({
  titlePrompt: system => (
   system.includes('Answer `<title/>` for greetings')
    ? streamText('none')
    : streamText('<title>空工作区问候</title>')
  ),
 }, '你好');
 try {
  expect(result.title).toBe('空工作区问候');
  expect(result.requests.map(entry => entry.kind)).toEqual(['foreground', 'title-opening', 'title-context']);
 } finally {
  await result.close();
 }
}, 30_000);

test('auto-title re-arm test', async () => {
 let supersedingSent = false;
 let workerRef: WorkerSession | undefined;
 const result = await session(
  {
   titlePrompt: system => (
    system.includes('Answer `<title/>` for greetings')
     ? streamText('none')
     : streamText('<title>统计路由修复</title>')
   ),
  },
  '看看统计路由',
  async worker => {
   if (supersedingSent) return;
   supersedingSent = true;
   workerRef = worker;
   const supersedingPrompt: PromptRequest = {
    input: { text: '第二条指令', context: [], attachments: [] },
    options: { providerId: 'native-fixture', modelId: 'native-model', agentId: null, variant: null, reasoningEffort: null },
   };
   await worker.operation({ type: 'prompt', runId: 'superseding-run', request: supersedingPrompt });
  },
 );
 try {
  expect(result.name).toBe('统计路由修复');
  expect(result.title).toBe('统计路由修复');
  const titleEvents = result.events.filter(e => e.event.type === 'session.updated' && 'title' in e.event && e.event.title);
  expect(titleEvents).toHaveLength(1);

  // A session already titled must not be retitled on subsequent prompts.
  if (workerRef) {
   const terminal = Promise.withResolvers<void>();
   const unsubscribe = workerRef.session.subscribe(event => {
    if (event.type === 'agent_end') terminal.resolve();
   });
   try {
    const thirdPrompt: PromptRequest = {
     input: { text: '第三条指令', context: [], attachments: [] },
     options: { providerId: 'native-fixture', modelId: 'native-model', agentId: null, variant: null, reasoningEffort: null },
    };
    await workerRef.operation({ type: 'prompt', runId: 'third-run', request: thirdPrompt });
    await terminal.promise;
   } finally {
    unsubscribe();
   }
   expect(workerRef.session.sessionManager.getSessionName()).toBe('统计路由修复');
   const titleEventsAfter = result.events.filter(e => e.event.type === 'session.updated' && 'title' in e.event && e.event.title);
   expect(titleEventsAfter).toHaveLength(1);
  }
 } finally {
  await result.close();
 }
}, 30_000);
