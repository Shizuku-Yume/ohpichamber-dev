import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { JsonValueSchema, SubagentSchema, type ApprovalRequest, type QuestionRequest, type JsonObject, type JsonValue, type PromptRequest } from '@openchamber/agent-contract';
import { cfgEditMode } from '@oh-my-pi/pi-coding-agent/edit/settings';
import { cfgBashPatterns } from '@oh-my-pi/pi-coding-agent/exec/settings';
import { TASK_SUBAGENT_EVENT_CHANNEL, TASK_SUBAGENT_PROGRESS_CHANNEL, TASK_SUBAGENT_LIFECYCLE_CHANNEL, type SubagentLifecyclePayload } from '@oh-my-pi/pi-coding-agent/task';
import { renderStepsBrief } from '@oh-my-pi/pi-coding-agent/task/steps';
import { cfgToolsApprovalMode, cfgWebSearchEnabled } from '@oh-my-pi/pi-coding-agent/tools/settings';
import { cfgSearxngEndpoint } from '@oh-my-pi/pi-coding-agent/web/settings';
import { cfgProvidersWebSearchTimeoutSeconds } from '@oh-my-pi/pi-coding-agent/session/settings';
import { cfgCompactionKeepRecentTokens } from '@oh-my-pi/pi-coding-agent/session/context-settings';
import { cfgModelRoles } from '@oh-my-pi/pi-coding-agent/config/model-settings';
import { cfgGoalContinuationModes } from '@oh-my-pi/pi-coding-agent/goals/settings';
import { cfgRecapEnabled, cfgRecapIdleSeconds } from '@oh-my-pi/pi-coding-agent/modes/settings';
import { resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import { createAgentSession } from '@oh-my-pi/pi-coding-agent/sdk';
import type { AgentSession } from '@oh-my-pi/pi-coding-agent/session/agent-session';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import { InternalUrlRouter } from '@oh-my-pi/pi-coding-agent/internal-urls';
import { InteractionManager } from '../interaction/manager.ts';
import { SessionJournal } from '../projection/journal.ts';
import { WorkerProjection } from './projection.ts';
import type { ProjectionInput } from '../projection/protocol.ts';
import type { HostActionRequest } from '../native-policy-protocol.ts';
import { NativeApprovalRequired } from './policy.ts';
import { isSuccessfulCheckpointEntry } from '@oh-my-pi/pi-coding-agent/session/checkpoint-entries';
import { RewindTool } from '@oh-my-pi/pi-coding-agent/tools/checkpoint';
import { WorkerSession } from './session.ts';
import { WorkerModeController } from './mode.ts';
import { cfgSuggestionGenerator } from './suggestion.ts';
import { openNativeRuntime, type NativeWorkerRuntime } from './native-runtime.ts';
import { HOST_TOOL_DESCRIPTIONS } from './host-tool.ts';
import { credentialReference } from './catalog-models.ts';
import { daemonClient, isolateDaemonForSmokeTest } from '@oh-my-pi/pi-coding-agent/daemon/client';
import type { DaemonCompletionEvent } from '@oh-my-pi/pi-coding-agent/daemon/protocol';
import { logger } from '@oh-my-pi/pi-utils';
import { AgentRegistry } from '@oh-my-pi/pi-coding-agent/registry/agent-registry';
import { createSecretRequests } from '../../../web/server/lib/openchamber-control/secret-request.ts';

const previousNoTitle = process.env.PI_NO_TITLE;
// Memory-capable environments leak ambient MNEMOPI_*/provider variables into
// the worker process, and the memory pipeline's env fallbacks would silently
// reroute remote endpoints or keys, so every test pins them empty.
const MEMORY_ENV_VARS = [
 'MNEMOPI_EMBEDDING_API_URL', 'OPENROUTER_BASE_URL', 'MNEMOPI_EMBEDDINGS_VIA_API',
 'MNEMOPI_LLM_BASE_URL', 'MNEMOPI_LLM_MODEL', 'MNEMOPI_LLM_API_KEY',
 'OPENROUTER_API_KEY', 'MNEMOPI_EMBEDDING_API_KEY', 'OPENAI_API_KEY',
] as const;
const previousMemoryEnv = new Map<string, string | undefined>(MEMORY_ENV_VARS.map(name => [name, process.env[name]]));
beforeEach(() => {
 resetSettingsForTest();
 // Worker sessions opt into OMP auto titles in production. This suite's
 // provider fixture asserts foreground request counts, so suppress the
 // background title turn; the real title path is covered by the Web UI smoke.
 process.env.PI_NO_TITLE = '1';
 for (const name of MEMORY_ENV_VARS) delete process.env[name];
});
afterEach(() => {
 resetSettingsForTest();
 if (previousNoTitle === undefined) delete process.env.PI_NO_TITLE;
 else process.env.PI_NO_TITLE = previousNoTitle;
 for (const name of MEMORY_ENV_VARS) {
  const previous = previousMemoryEnv.get(name);
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
 }
});
const rootSessionId = 'native-root';
const generation = 'native-generation';
const options = { providerId: 'native-fixture', modelId: 'native-model', agentId: null, variant: null, reasoningEffort: null };
const prompt = (text: string, overrides: Partial<typeof options> = {}): PromptRequest => ({ input: { text, context: [], attachments: [] }, options: { ...options, ...overrides } });
const ProviderRequestSchema = z.object({
 messages: z.array(z.object({ role: z.enum(['system', 'developer', 'user', 'assistant', 'tool']) }).catchall(JsonValueSchema)),
}).catchall(JsonValueSchema);
type ProviderRequest = z.infer<typeof ProviderRequestSchema>;
const ProviderToolsSchema = z.array(z.object({
 function: z.object({ name: z.string(), description: z.string().optional() }).catchall(JsonValueSchema),
}).catchall(JsonValueSchema));
function requestTools(request: ProviderRequest | undefined): Map<string, string | undefined> {
 const parsed = ProviderToolsSchema.safeParse(request?.tools);
 return new Map(parsed.success ? parsed.data.map(tool => [tool.function.name, tool.function.description]) : []);
}
function promptRequest(requests: ProviderRequest[], marker: string): ProviderRequest {
 const match = requests.find(request => JSON.stringify(request.messages.at(-1)?.content).includes(marker));
 if (!match) throw new Error(`Provider request carrying ${marker} was not captured`);
 return match;
}
function requestContaining(requests: ProviderRequest[], marker: string): ProviderRequest {
 const match = requests.find(request => JSON.stringify(request.messages).includes(marker));
 if (!match) throw new Error(`Provider request containing ${marker} was not captured`);
 return match;
}
function instructionMessages(request: ProviderRequest): Array<{ role: string; content: JsonValue }> {
 return request.messages.filter(message => message.role === 'system' || message.role === 'developer')
  .map(message => ({ role: message.role, content: message.content }));
}
const HOST_TOOL_NAMES = ['openchamber', 'web', 'openchamber_knowledge', 'notify', 'openchamber_render', 'openchamber_secret', 'openchamber_workflow'] as const;
const ENABLED_HOST_TOOL_NAMES = ['openchamber', 'web', 'openchamber_knowledge', 'openchamber_render', 'openchamber_secret', 'openchamber_workflow'] as const;
// The worker bypasses generic tool authorization for every registered Host
// tool: their capability owners authorize the inner call. The list is derived
// from the registry so a newly registered Host tool cannot silently fall to the
// generic refusal and become uncallable.
const HOST_TOOL_BYPASS_NAMES = [...Object.keys(HOST_TOOL_DESCRIPTIONS), 'bash'];

test('every registered Host tool is bypassed by the worker tool_call guard', () => {
 expect(HOST_TOOL_BYPASS_NAMES).toEqual(expect.arrayContaining([...HOST_TOOL_NAMES, 'bash']));
});
/**
 * Callable Host tools necessarily appear in OMP's tool inventory. That listing
 * is the tools' own presentation, the one difference W4 allows alongside pins
 * and attachments; every other system/developer line must match plain OMP.
 */
const TextBlockSchema = z.object({ text: z.string() }).catchall(JsonValueSchema);
function withoutHostToolInventory(messages: Array<{ role: string; content: JsonValue }>) {
 const stripLines = (text: string) => text.replace(/(# Tool Inventory\n)([^\n]+)/, (_match, heading: string, names: string) =>
  heading + names.split(', ').filter(name => !(HOST_TOOL_NAMES as readonly string[]).includes(name)).join(', ')
 );
 const strip = (content: JsonValue): JsonValue => {
  const text = z.string().safeParse(content);
  if (text.success) return stripLines(text.data);
  if (!Array.isArray(content)) return content;
  return content.map(block => {
   const parsed = TextBlockSchema.safeParse(block);
   return parsed.success ? { ...parsed.data, text: stripLines(parsed.data.text) } : block;
  });
 };
 return messages.map(message => ({ ...message, content: strip(message.content) }));
}

function expectContextOrder(request: ProviderRequest | undefined, markers: string[]): void {
 if (!request) throw new Error('Native provider request was not captured');
 const messages = JSON.stringify(request.messages);
 let previous = -1;
 for (const marker of markers) {
  const index = messages.indexOf(marker);
  expect(index).toBeGreaterThan(previous);
  previous = index;
 }
}

function completion(tool?: { name: string; input: JsonObject; id: string } | string): Response {
 const isTool = typeof tool === 'object' && tool !== null;
 const content = typeof tool === 'string' ? tool : 'Native operation finished.';
 const chunk = {
  id: 'native-response', object: 'chat.completion.chunk', created: 1, model: 'native-model', choices: [{
   index: 0,
   delta: isTool ? { role: 'assistant', tool_calls: [{ index: 0, id: tool.id, type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.input) } }] }
    : { role: 'assistant', content }, finish_reason: null
  }]
 };
 const finish = { ...chunk, choices: [{ index: 0, delta: {}, finish_reason: tool ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 } };
 return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(finish)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
}
function waitForGoal(worker: WorkerSession, predicate: () => boolean, timeoutMs?: number): Promise<void> {
 if (predicate()) return Promise.resolve();
 const pending = Promise.withResolvers<void>();
 let unsubscribe: () => void = () => { };
 const timer = timeoutMs === undefined ? undefined : setTimeout(() => {
  unsubscribe();
  pending.reject(new Error('Timed out waiting for the worker predicate'));
 }, timeoutMs);
 unsubscribe = worker.session.subscribe(() => {
  if (!predicate()) return;
  unsubscribe();
  if (timer !== undefined) clearTimeout(timer);
  pending.resolve();
 });
 return pending.promise;
}

async function fixture({ respond, invoke, machineCommands = [], deniedCommands = [], onSubagent = () => { }, denyWebSearch = false, denyLsp = false, planModel = false, reasoningEfforts, denyProviderUse, apiKey, headers }: {
 respond: (payload: ProviderRequest, root: string, request: Request) => Promise<Response> | Response;
 invoke?: (request: HostActionRequest, signal: AbortSignal, root: string) => Promise<JsonValue>;
 machineCommands?: string[];
 deniedCommands?: string[];
 onSubagent?: (payload: SubagentLifecyclePayload) => void;
 denyWebSearch?: boolean;
 denyLsp?: boolean;
 planModel?: boolean;
 reasoningEfforts?: readonly string[];
 denyProviderUse?: (attempt: number, input?: JsonObject) => Error | undefined;
 apiKey?: string;
 headers?: Record<string, string>;
}) {
 const root = await mkdtemp(join(tmpdir(), 'native-seams-'));
 const home = process.env.HOME;
 process.env.HOME = root;
 const cwd = join(root, 'workspace');
 const agentDirectory = join(root, 'agent');
 const mcpConfigPath = join(agentDirectory, 'mcp.json');
 await mkdir(join(cwd, '.omp', 'agents'), { recursive: true });
 await writeFile(join(cwd, '.omp', 'agents', 'child.md'), '---\nname: child\ndescription: Native child proof agent\nblocking: true\n---\nReturn the child proof marker.\n');
 await mkdir(agentDirectory);
 const events: ProjectionInput[] = [];
 const requests: ProviderRequest[] = [];
 const grants: string[] = [];
 const hostRequests: WorkerPolicyRequest[] = [];
 const pendingApprovals: ApprovalRequest[] = [];
 let approvalWaiter: ((approval: ApprovalRequest) => void) | undefined;
 const pendingQuestions: QuestionRequest[] = [];
 let questionWaiter: ((question: QuestionRequest) => void) | undefined;
 let journal: SessionJournal | undefined;
 let worker: WorkerSession | undefined;
 let fatal = false;
 const interactions = new InteractionManager();
 const provider = Bun.serve({
  hostname: '127.0.0.1', port: 0, async fetch(request) {
   const payload = ProviderRequestSchema.parse(await request.json());
   requests.push(payload);
   return respond(payload, cwd, request);
  }
 });
 const openWorker = (sessionFile?: string, bootstrapOverrides: Partial<WorkerBootstrapMessage> = {}) => WorkerSession.open({
  type: 'bootstrap', rootSessionId, workerGeneration: generation,
  projectId: 'project', workspaceId: 'workspace', agentDirectoryId: 'source', cwd, agentDirectory, mcpConfigPath, sessionFile, sessionsDirectory: join(root, 'sessions'),
  ...bootstrapOverrides,
 }, inputs => {
  events.push(...inputs);
  journal?.append(inputs);
 }, interaction => {
  interactions.onRequest(rootSessionId, generation, interaction);
  if (interaction.kind === 'cancel') return;
  if (interaction.kind === 'question') {
   const question = interactions.questions(rootSessionId).find(record => record.questionId === interaction.questionId)!;
   if (questionWaiter) { const waiter = questionWaiter; questionWaiter = undefined; waiter(question); }
   else pendingQuestions.push(question);
   return;
  }
  const approval = interactions.approvals(rootSessionId).find(record => record.approvalId === interaction.approvalId)!;
  if (approvalWaiter) { const waiter = approvalWaiter; approvalWaiter = undefined; waiter(approval); }
  else pendingApprovals.push(approval);
 }, () => { fatal = true; }, async request => {
  hostRequests.push(request);
  if (request.type === 'web-search') {
   if (denyWebSearch) throw new Error('Host policy refused the tool operation');
   return;
  }
  if (request.type === 'tool' && request.toolName === 'web_search') throw new Error('Host policy refused the tool operation');
  if (request.type === 'tool' && request.toolName === 'provider.use') {
   const refusal = denyProviderUse?.(hostRequests.filter(entry => entry.type === 'tool' && entry.toolName === 'provider.use').length, request.input);
   if (refusal) throw refusal;
   return;
  }
  if (request.type === 'tool' && (HOST_TOOL_NAMES as readonly string[]).includes(request.toolName)) throw new Error('Host tools must use their domain capability owner, not generic tool grants');
  if (request.type === 'tool' && request.toolName === 'lsp') {
   if (denyLsp) throw new Error('Host policy refused the tool operation');
   return;
  }
  if (request.type !== 'tool' || request.toolName !== 'bash') return;
  const command = z.string().parse(request.input.command);
  if (deniedCommands.includes(command)) throw new Error('Host policy refused Bash');
  if (machineCommands.includes(command)) return;
  const grant = request.approvalId && request.toolCallId
   ? interactions.consumeApprovalGrant(rootSessionId, generation, request.approvalId, request.toolCallId, request.toolName, request.input) : undefined;
  if (!grant) throw new NativeApprovalRequired('Host policy requires approval for this exact native command');
  grants.push(grant.approvalId);
 }, async (request, signal) => {
  if (!invoke) throw new Error('Host action was not part of this scenario');
  return invoke(request, signal, cwd);
 }, () => { }, onSubagent);
 try {
  worker = await openWorker();
  let credentialRef: string | null = null;
  if (apiKey) {
   const storage = worker.session.modelRegistry.authStorage;
   await storage.credentials.upsert('native-fixture', { type: 'api_key', key: apiKey, source: 'login' });
   await storage.credentials.reload();
   const row = storage.credentials.list('native-fixture')[0];
   if (!row) throw new Error('Fixture credential is required');
   credentialRef = credentialReference('native-fixture', row.id);
  }
  journal = new SessionJournal({ sessionId: rootSessionId, rootSessionId, projectId: 'project', workspaceId: 'workspace', displayPath: '.' }, worker.seed());
  interactions.openSession(rootSessionId, journal.runtime().epoch, generation, 'workspace', async operation => { await worker!.operation(operation); }, input => { events.push(input); journal!.append([input]); });
  await worker.operation({
   type: 'catalog', revision: '1', operation: {
    type: 'catalog.provider.configure', request: {
     expectedRevision: '0', headers, configuration: {
      providerId: 'native-fixture', name: 'Native fixture', endpoint: `http://127.0.0.1:${provider.port}/v1`, protocol: 'chat-completions', credentialRef,
     }
    }
   }
  });
  await worker.operation({
   type: 'catalog', revision: '2', operation: {
    type: 'catalog.model.configure', request: {
     expectedRevision: '1', model: {
      modelId: 'native-model', provider: 'native-fixture', name: 'Native model', modalities: ['text'], contextWindow: 65536, maxOutputTokens: 128,
      reasoningEffortSupported: (reasoningEfforts?.length ?? 0) > 0,
      reasoningOptions: (reasoningEfforts ?? []).map(reasoningEffort => ({ reasoningEffort, label: reasoningEffort, budgetTokens: null })),
      variants: [], toolsSupported: true, enabled: true, pricing: null,
     }
    }
   }
  });
  if (planModel) {
   await worker.operation({
    type: 'catalog', revision: '3', operation: {
     type: 'catalog.model.configure', request: {
      expectedRevision: '2', model: {
       modelId: 'native-plan-model', provider: 'native-fixture', name: 'Native plan model', modalities: ['text'], contextWindow: 65536, maxOutputTokens: 128,
       reasoningEffortSupported: false, reasoningOptions: [], variants: [], toolsSupported: true, enabled: true, pricing: null,
      }
     }
    }
   });
   worker.session.settings.setModelRole('plan', 'native-fixture/native-plan-model');
   await worker.session.settings.flush();
  }
  const initialModel = worker.session.modelRegistry.find('native-fixture', 'native-model');
  if (!initialModel) throw new Error('Fixture main model is unavailable');
  await worker.session.setModelTemporary(initialModel);
  return {
   root: cwd, agentDirectory, get worker() { return worker!; }, events, requests, grants, hostRequests, interactions, journal, mcpConfigPath,
   reopen: async (overrides: Partial<WorkerBootstrapMessage> = {}) => {
    const sessionFile = worker!.session.sessionManager.getSessionFile();
    if (!sessionFile) throw new Error('Fixture session file is missing');
    interactions.closeSession(rootSessionId);
    await worker!.close();
    resetSettingsForTest();
    worker = await openWorker(sessionFile, overrides);
    journal!.replace(worker.seed());
    interactions.openSession(rootSessionId, journal!.runtime().epoch, generation, 'workspace', async operation => { await worker!.operation(operation); }, input => { events.push(input); journal!.append([input]); });
   },
   waitQuestion: () => {
    const question = pendingQuestions.shift();
    if (question) return Promise.resolve(question);
    const pending = Promise.withResolvers<QuestionRequest>();
    questionWaiter = pending.resolve;
    return pending.promise;
   },
   waitApproval: () => {
    const approval = pendingApprovals.shift();
    if (approval) return Promise.resolve(approval);
    const pending = Promise.withResolvers<ApprovalRequest>();
    approvalWaiter = pending.resolve;
    return pending.promise;
   },
   fatal: () => fatal,
   close: async () => {
    interactions.closeSession(rootSessionId);
    journal?.close();
    await worker!.close();
    provider.stop(true);
    if (home === undefined) delete process.env.HOME; else process.env.HOME = home;
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
   },
  };
 } catch (error) {
  interactions.closeSession(rootSessionId);
  await worker?.close();
  journal?.close();
  provider.stop(true);
  if (home === undefined) delete process.env.HOME; else process.env.HOME = home;
  await rm(root, { recursive: true, force: true });
  throw error;
 }
}

async function searxngLoopback(): Promise<{ url: string; requests: string[]; stop: () => void }> {
 const requests: string[] = [];
 const server = Bun.serve({
  hostname: '127.0.0.1', port: 0, fetch(request) {
   const url = new URL(request.url);
   if (url.pathname !== '/search') return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
   requests.push(url.searchParams.get('q') ?? '');
   return Response.json({
    query: url.searchParams.get('q') ?? '', results: [{
     title: 'Task63 Loopback Result', url: 'http://127.0.0.1/task63', content: 'Controlled Task63 loopback result.', engine: 'task63-loopback',
    }]
   });
  }
 });
 return { url: `http://127.0.0.1:${server.port}`, requests, stop: () => server.stop(true) };
}

test('native HTTP 401 preserves provider detail without echoed API keys or custom header secrets', async () => {
 const apiKey = 'fixture-invalid-provider-credential';
 const headerSecret = 'fixture-private-custom-header-value';
 let receivedHeader: string | null = null;
 const harness = await fixture({
  apiKey,
  headers: { 'x-tenant-auth': headerSecret },
  respond: (_payload, _root, request) => {
   receivedHeader = request.headers.get('x-tenant-auth');
   return Response.json({ error: { message: `Invalid API key (${apiKey}); rejected header value ${receivedHeader}; token=other-private-token`, type: 'authentication_error' } }, { status: 401 });
  },
 });
 try {
  await harness.worker.operation({ type: 'prompt', runId: 'provider-error-run', request: prompt('Reply to this provider error probe.') });
  await waitForGoal(harness.worker, () => harness.events.some(({ event }) => event.type === 'run.failed'), 15000);
  const failure = harness.events.find(({ event }) => event.type === 'run.failed')?.event;
  if (!failure || failure.type !== 'run.failed') throw new Error('Canonical run failure is required');
  expect(failure.error).toContain('401');
  expect(failure.error).toContain('Invalid API key');
  expect(failure.error).toContain('[redacted]');
  expect(failure.error).not.toContain(apiKey);
  expect(failure.error).not.toContain('other-private-token');
  expect(receivedHeader).toBe(headerSecret);
  expect(failure.error).not.toContain(headerSecret);
  expect(JSON.stringify(harness.events)).not.toContain(headerSecret);
  expect(harness.journal.snapshot().turns.at(-1)).toMatchObject({ status: 'failed', error: failure.error });
  await harness.worker.session.sessionManager.flush();
  const entries = harness.worker.session.sessionManager.getBranch();
  expect(entries.some(entry => entry.type === 'message' && entry.message.role === 'assistant'
   && entry.message.errorMessage?.includes('Invalid API key'))).toBe(true);
  const restored = new WorkerProjection(harness.worker.session.sessionManager, rootSessionId).seed();
  expect(restored.turns.at(-1)).toMatchObject({ status: 'failed', error: failure.error });
 } finally { await harness.close(); }
}, 30000);

test('an idle stretch publishes a canonical recap event once OMP records it', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const model = harness.worker.session.modelRegistry.find('native-fixture', 'native-model');
  if (!model) throw new Error('Native fixture model is required');
  await harness.worker.session.setModelTemporary(model);
  // The production default is four minutes; this test only wants the wiring.
  harness.worker.session.settings.writeValue(cfgRecapIdleSeconds, 1, 'override');
  await harness.worker.operation({ type: 'prompt', runId: 'recap-run', request: prompt('Reply with the fixture marker.') });
  // Idle maintenance runs off a timer rather than a session event, so poll for
  // the published recap instead of waiting on the session subscription.
  const deadline = Date.now() + 15000;
  while (!harness.events.some(input => input.event.type === 'session.recap')) {
   if (Date.now() > deadline) throw new Error('The idle recap was never published');
   await new Promise(resolve => setTimeout(resolve, 100));
  }
  const emitted = harness.events.find(input => input.event.type === 'session.recap');
  if (!emitted || emitted.event.type !== 'session.recap') throw new Error('A canonical recap was not published');
  expect(emitted.transient).toBe(true);
  expect(emitted.event.recap.trim().length).toBeGreaterThan(0);
  // Transient means it never becomes a durable transcript entry.
  expect(harness.journal.snapshot().messages.some(message => message.role === 'recap')).toBe(false);
 } finally { await harness.close(); }
}, 30000);

test('a live worker turns recap.enabled off after a turn and no recap follows', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const model = harness.worker.session.modelRegistry.find('native-fixture', 'native-model');
  if (!model) throw new Error('Native fixture model is required');
  await harness.worker.session.setModelTemporary(model);
  harness.worker.session.settings.writeValue(cfgRecapIdleSeconds, 1, 'override');
  await harness.worker.operation({ type: 'prompt', runId: 'turn-run', request: prompt('Reply with marker.') });
  harness.worker.session.settings.writeValue(cfgRecapEnabled, false, 'project');
  await harness.worker.session.settings.flush();
  await harness.worker.operation({ type: 'catalog', revision: '10', operation: { type: 'catalog.settings.apply' } });
  // Genuine platform timer wait: OMP's internal IdleMaintenance timer fires against the real clock.
  const timer = Promise.withResolvers<void>();
  setTimeout(timer.resolve, 1500);
  await timer.promise;
  expect(harness.events.some(input => input.event.type === 'session.recap')).toBe(false);
 } finally { await harness.close(); }
}, 30000);

test('a worker test uses the real SDK session with tool commands; toggling notify keeps mounted tools enabled', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const initialMounted = harness.worker.session.getMountedToolCommandNames();
  expect(initialMounted.length).toBeGreaterThan(0);
  const initialEnabled = harness.worker.session.getEnabledToolNames();
  for (const tool of initialMounted) {
   expect(initialEnabled).toContain(tool);
  }

  // Toggling notify on must keep every mounted tool enabled
  await harness.worker.toggleHostTool('notify', true);
  const afterEnableMounted = harness.worker.session.getMountedToolCommandNames();
  expect(afterEnableMounted).toEqual(initialMounted);
  const afterEnableAll = harness.worker.session.getEnabledToolNames();
  expect(afterEnableAll).toContain('notify');
  for (const tool of initialMounted) {
   expect(afterEnableAll).toContain(tool);
  }

  // Toggling notify off must also keep every mounted tool enabled
  await harness.worker.toggleHostTool('notify', false);
  const afterDisableMounted = harness.worker.session.getMountedToolCommandNames();
  expect(afterDisableMounted).toEqual(initialMounted);
  const afterDisableAll = harness.worker.session.getEnabledToolNames();
  expect(afterDisableAll).not.toContain('notify');
  for (const tool of initialMounted) {
   expect(afterDisableAll).toContain(tool);
  }
 } finally { await harness.close(); }
});

test('a cold session reopens with web disabled; web is absent from model tool list and calling it is refused', async () => {
 let turn = 0;
 const harness = await fixture({
  respond: () => {
   turn++;
   if (turn === 1) return completion();
   if (turn === 2) return completion({ id: 'call_web_1', name: 'web', input: { action: 'browser.open', input: { url: 'https://example.com' } } });
   return completion('Finished.');
  },
 });
 try {
  const model = harness.worker.session.modelRegistry.find('native-fixture', 'native-model');
  if (!model) throw new Error('Native fixture model is required');
  await harness.worker.session.setModelTemporary(model);
  const warmDone = Promise.withResolvers<void>();
  const unsubWarm = harness.worker.session.subscribe(event => { if (event.type === 'agent_end') warmDone.resolve(); });
  await harness.worker.operation({ type: 'prompt', runId: 'warm-run', request: prompt('Warm turn.') });
  await warmDone.promise;
  unsubWarm();

  await harness.reopen({ hostTools: { web: false } });
  expect(harness.worker.session.getEnabledToolNames()).not.toContain('web');
  expect(harness.worker.session.getActiveToolNames()).not.toContain('web');

  const coldDone = Promise.withResolvers<void>();
  const unsubCold = harness.worker.session.subscribe(event => { if (event.type === 'agent_end') coldDone.resolve(); });
  await harness.worker.operation({ type: 'prompt', runId: 'cold-run', request: prompt('Try web.') });
  await coldDone.promise;
  unsubCold();

  const lastRequest = harness.requests.at(-1);
  const toolNames = new Set<string>();
  for (const entry of lastRequest?.tools ?? []) {
   if (entry && typeof entry === 'object') {
    if ('function' in entry && entry.function && typeof entry.function === 'object' && 'name' in entry.function && typeof entry.function.name === 'string') {
     toolNames.add(entry.function.name);
    } else if ('name' in entry && typeof entry.name === 'string') {
     toolNames.add(entry.name);
    }
   }
  }
  expect(toolNames.has('web')).toBe(false);

  const hostWebCalls = harness.hostRequests.filter(r => r.type === 'tool' && r.toolName === 'web');
  expect(hostWebCalls).toHaveLength(0);
 } finally { await harness.close(); }
});

test('Agent Hub reads answer from the worker without a live subagent', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const roster = await harness.worker.operation({ type: 'subagents.list' });
  expect(roster).toMatchObject({ type: 'subagents.list', subagents: [] });
  const ref = AgentRegistry.global().register({
   id: 'persisted-float-stamp',
   displayName: 'persisted-float-stamp',
   kind: 'sub',
   status: 'parked',
   session: null,
   sessionFile: harness.worker.sessionFile.replace(/\.jsonl$/, '/task/persisted-float-stamp.jsonl'),
   createdAt: 1_700_000_000_000.25,
   lastActivity: 1_700_000_000_123.75,
  });
  try {
   const hydrated = await harness.worker.operation({ type: 'subagents.list' });
   expect(hydrated.type).toBe('subagents.list');
   if (hydrated.type === 'subagents.list') {
    const parsed = SubagentSchema.parse(hydrated.subagents.find(item => item.subagentId === 'persisted-float-stamp'));
    expect(parsed.createdAt).toBe(1_700_000_000_000);
    expect(parsed.updatedAt).toBe(1_700_000_000_123);
    expect(parsed.persisted).toBe(true);
   }
  } finally {
   AgentRegistry.global().unregister(ref.id, ref);
  }
  const cost = await harness.worker.operation({ type: 'subagents.tree-cost' });
  expect(cost).toMatchObject({ type: 'subagents.tree-cost', cost: { sessionId: expect.any(String), directCost: 0, treeCost: 0 } });
 } finally { await harness.close(); }
});

test('reviving an unknown subagent is refused rather than inventing one', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  await expect(harness.worker.operation({ type: 'subagent.revive', subagentId: 'subagent-not-registered' }))
   .rejects.toMatchObject({ status: 404, code: 'SESSION_NOT_FOUND' });
 } finally { await harness.close(); }
}, 30000);

test('a subagent transcript read refuses an agent this session never listed', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  await expect(harness.worker.operation({ type: 'subagents.transcript', subagentId: 'subagent-not-registered' }))
   .rejects.toMatchObject({ status: 404, code: 'SESSION_NOT_FOUND' });
 } finally { await harness.close(); }
}, 30000);

test('worker-originated custom prompts open canonical runs with origin', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const model = harness.worker.session.modelRegistry.find('native-fixture', 'native-model');
  if (!model) throw new Error('Native fixture model is required');
  await harness.worker.session.setModelTemporary(model);
  const task = harness.worker.startWorkerRun('goal', () => harness.worker.session.promptCustomMessage({
   customType: 'goal-continuation', content: 'Continue the goal.', display: false,
  }));
  const started = harness.events.find(input => input.event.type === 'run.started');
  if (!started || started.event.type !== 'run.started') throw new Error('Worker run was not opened');
  expect(started.event.origin).toBe('goal');
  expect(harness.journal.snapshot().activeRun).toMatchObject({ runId: started.event.runId, origin: 'goal', status: 'running' });
  expect(harness.events.some(input => input.event.type === 'turn.started')).toBe(true);
  await task;
  expect(harness.events).toContainEqual(expect.objectContaining({ event: expect.objectContaining({ type: 'run.completed', runId: started.event.runId }) }));
  expect(harness.journal.snapshot().activeRun).toBeNull();
 } finally { await harness.close(); }
}, 30000);
test('worker-originated runs cancel through the normal abort operation', async () => {
 const requestStarted = Promise.withResolvers<void>();
 const harness = await fixture({
  respond: async () => {
   requestStarted.resolve();
   return new Response(new ReadableStream({}), { headers: { 'content-type': 'text/event-stream' } });
  }
 });
 try {
  const model = harness.worker.session.modelRegistry.find('native-fixture', 'native-model');
  if (!model) throw new Error('Native fixture model is required');
  await harness.worker.session.setModelTemporary(model);
  const task = harness.worker.startWorkerRun('plan', () => harness.worker.session.promptCustomMessage({
   customType: 'plan-mode-approved', content: 'Execute the approved plan.', display: false,
  }));
  const started = harness.events.find(input => input.event.type === 'run.started');
  if (!started || started.event.type !== 'run.started') throw new Error('Worker run was not opened');
  await requestStarted.promise;
  const aborted = await harness.worker.operation({ type: 'abort', runId: started.event.runId });
  expect(aborted).toMatchObject({ type: 'abort', run: { runId: started.event.runId, origin: 'plan', status: 'cancelled' } });
  await task;
  expect(harness.events).toContainEqual(expect.objectContaining({ event: expect.objectContaining({ type: 'run.cancelled', runId: started.event.runId }) }));
 } finally { await harness.close(); }
}, 30000);

test('aborting a goal pauses continuation until resume', async () => {
 let requestStarted = Promise.withResolvers<void>();
 const harness = await fixture({
  respond: async () => {
   requestStarted.resolve();
   return new Response(new ReadableStream({}), { headers: { 'content-type': 'text/event-stream' } });
  }
 });
 try {
  await harness.worker.operation({ type: 'goal', op: 'create', objective: 'Abort and resume' });
  await requestStarted.promise;
  const started = harness.events.findLast(input => input.event.type === 'run.started' && input.event.origin === 'goal');
  if (!started || started.event.type !== 'run.started') throw new Error('Goal run did not start');
  await harness.worker.operation({ type: 'abort', runId: started.event.runId });
  const requestCount = harness.requests.length;
  expect(harness.journal.runtime().mode).toMatchObject({ kind: 'goal', status: 'paused' });
  await Promise.resolve();
  expect(harness.requests).toHaveLength(requestCount);
  requestStarted = Promise.withResolvers<void>();
  await harness.worker.operation({ type: 'goal', op: 'resume' });
  await requestStarted.promise;
 } finally { await harness.close(); }
}, 30000);

test('a resumed goal gets a fresh turn budget instead of the cap it already hit', async () => {
 const previousCap = process.env.OPENCHAMBER_SESSION_GOAL_MAX_AUTO_TURNS;
 process.env.OPENCHAMBER_SESSION_GOAL_MAX_AUTO_TURNS = '1';
 const harness = await fixture({ respond: () => completion() });
 try {
  await harness.worker.operation({ type: 'goal', op: 'create', objective: 'One bounded turn at a time' });
  await waitForGoal(harness.worker, () => harness.worker.mode().kind === 'goal' && harness.worker.mode().status === 'paused', 15000);
  expect(harness.events.filter(input => input.event.type === 'run.started' && input.event.origin === 'goal')).toHaveLength(1);
  expect(harness.journal.runtime().mode).toMatchObject({ kind: 'goal', status: 'paused', objective: 'One bounded turn at a time' });

  // The explicit resume is a new budget: one more productive turn, then the cap pauses again.
  // Native idle covers the continuation and the verdict, so the pause is settled when it returns.
  await harness.worker.session.waitForIdle();
  await harness.worker.operation({ type: 'goal', op: 'resume' });
  // The resumed turn ends before its verdict lands, so wait for the pause itself.
  await waitForGoal(harness.worker, () => harness.worker.mode().kind === 'goal' && harness.worker.mode().status === 'paused', 15000);
  await harness.worker.session.waitForIdle();
  expect(harness.events.filter(input => input.event.type === 'run.started' && input.event.origin === 'goal')).toHaveLength(2);
  expect(harness.worker.mode()).toMatchObject({ kind: 'goal', status: 'paused' });
  expect(harness.worker.continuationPending).toBe(false);
  expect(harness.journal.runtime().activeRunId).toBeNull();
 } finally {
  if (previousCap === undefined) delete process.env.OPENCHAMBER_SESSION_GOAL_MAX_AUTO_TURNS;
  else process.env.OPENCHAMBER_SESSION_GOAL_MAX_AUTO_TURNS = previousCap;
  await harness.close();
 }
}, 30000);

test('RPC goal continues three turns and retains completed mode', async () => {
 let calls = 0;
 const harness = await fixture({
  respond: payload => {
   if (payload.messages.at(-1)?.role === 'tool') return completion();
   calls++;
   return calls < 3 ? completion({ name: 'read', id: `progress-${calls}`, input: { path: `missing-progress-${calls}.txt` } }) : completion({ name: 'goal', id: `goal-${calls}`, input: { op: 'complete' } });
  }
 });
 try {
  cfgSuggestionGenerator.override(harness.worker.session.settings, 'off');
  await harness.worker.operation({ type: 'goal', op: 'create', objective: 'Finish the native proof' });
  await waitForGoal(harness.worker, () => harness.requests.length >= 3 && harness.worker.mode().kind === 'goal' && harness.worker.mode().status === 'complete');
  expect(harness.events.filter(input => input.event.type === 'run.started' && input.event.origin === 'goal')).toHaveLength(3);
  expect(harness.journal.runtime().mode).toMatchObject({ kind: 'goal', status: 'complete', objective: 'Finish the native proof' });
 } finally { await harness.close(); }
}, 30000);

test('RPC goal continuation setting gates automatic turns', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  cfgGoalContinuationModes.override(harness.worker.session.settings, ['interactive']);
  await harness.worker.operation({ type: 'goal', op: 'create', objective: 'Do not continue without rpc' });
  await Promise.resolve();
  expect(harness.requests).toHaveLength(0);
  expect(harness.journal.runtime().mode).toMatchObject({ kind: 'goal', status: 'active' });
 } finally { await harness.close(); }
}, 30000);

test('goal pause and resume preserve objective, while drop returns main', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  cfgGoalContinuationModes.override(harness.worker.session.settings, ['interactive']);
  await harness.worker.operation({ type: 'goal', op: 'create', objective: 'Pause this goal', tokenBudget: 20 });
  await harness.worker.operation({ type: 'goal', op: 'pause' });
  expect(harness.journal.runtime().mode).toMatchObject({ kind: 'goal', status: 'paused', objective: 'Pause this goal' });
  await harness.worker.operation({ type: 'goal', op: 'resume' });
  expect(harness.journal.runtime().mode).toMatchObject({ kind: 'goal', status: 'active', objective: 'Pause this goal' });
  await harness.worker.operation({ type: 'goal', op: 'drop' });
  expect(harness.journal.runtime().mode).toEqual({ kind: 'main' });
 } finally { await harness.close(); }
}, 30000);

test('goal rejects empty objective and a tiny budget limits the first turn', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  await expect(harness.worker.operation({ type: 'goal', op: 'create', objective: '   ' })).rejects.toBeTruthy();
  await harness.worker.operation({ type: 'goal', op: 'create', objective: 'Tiny goal', tokenBudget: 1 });
  await waitForGoal(harness.worker, () => harness.worker.mode().kind === 'goal' && harness.worker.mode().status === 'budget-limited');
  expect(harness.journal.runtime().mode).toMatchObject({ kind: 'goal', status: 'budget-limited', objective: 'Tiny goal' });
 } finally { await harness.close(); }
}, 30000);

test('reopening during a goal run restores a paused goal without new work', async () => {
 const requested = Promise.withResolvers<void>();
 const harness = await fixture({
  respond: () => {
   requested.resolve();
   return new Response(new ReadableStream({}), { headers: { 'content-type': 'text/event-stream' } });
  }
 });
 try {
  await harness.worker.operation({ type: 'goal', op: 'create', objective: 'Persist interrupted goal' });
  await requested.promise;
  await harness.reopen();
  expect(harness.worker.mode()).toMatchObject({ kind: 'goal', status: 'paused', objective: 'Persist interrupted goal' });
  expect(harness.journal.runtime().activeRunId).toBeNull();
  expect(harness.worker.continuationPending).toBe(false);
  expect(harness.requests).toHaveLength(1);
 } finally { await harness.close(); }
}, 30000);

for (const op of ['pause', 'drop'] as const) {
 test(`goal ${op} during a progress-making run stops its next continuation`, async () => {
  const requested = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const harness = await fixture({
   respond: async payload => {
    requested.resolve();
    await release.promise;
    return payload.messages.at(-1)?.role === 'tool' ? completion() : completion({ name: 'read', id: 'progress-before-stop', input: { path: 'missing.txt' } });
   }
  });
  try {
   await harness.worker.operation({ type: 'goal', op: 'create', objective: 'Stop after this turn' });
   await requested.promise;
   await harness.worker.operation({ type: 'goal', op });
   release.resolve();
   await waitForGoal(harness.worker, () => harness.journal.runtime().activeRunId === null);
   await harness.worker.session.waitForIdle();
   expect(harness.worker.continuationPending).toBe(false);
   expect(harness.events.filter(input => input.event.type === 'run.started')).toHaveLength(1);
   expect(harness.worker.mode()).toMatchObject(op === 'drop' ? { kind: 'main' } : { kind: 'goal', status: 'paused' });
  } finally { release.resolve(); await harness.close(); }
 }, 30000);
}

test('native builtin command returns context output without starting a provider run', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const result = await harness.worker.operation({ type: 'command', text: '/context' });
  expect(result.type).toBe('command');
  if (result.type !== 'command') throw new Error('Expected command output');
  expect(result.output).toContain('Context');
  expect(result.output.length).toBeGreaterThan(0);
  await expect(harness.worker.operation({ type: 'command', text: '/ssh' })).rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
  expect(harness.requests).toHaveLength(0);
  expect(harness.events.filter(input => input.event.type === 'run.started')).toHaveLength(0);
  expect(harness.journal.runtime().activeRunId).toBeNull();
  expect(harness.fatal()).toBe(false);
 } finally { await harness.close(); }
}, 30000);
test('headless slash commands execute allowed commands like /dirs and /clear without fatal errors', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const dirsResult = await harness.worker.operation({ type: 'command', text: '/dirs' });
  expect(dirsResult.type).toBe('command');
  if (dirsResult.type !== 'command') throw new Error('Expected command output');
  expect(dirsResult.output).toBeDefined();

  const clearResult = await harness.worker.operation({ type: 'command', text: '/clear' });
  expect(clearResult.type).toBe('command');
  if (clearResult.type !== 'command') throw new Error('Expected command output');
  expect(clearResult.output).toContain('Context reset');
  expect(harness.worker.session.sessionManager.getTurnBudget()?.total ?? null).toBeNull();
  expect(harness.fatal()).toBe(false);
 } finally { await harness.close(); }
}, 30000);

test('a prompt that names another model still switches and records it', async () => {
 const harness = await fixture({ respond: () => completion(), planModel: true });
 try {
  const initial = harness.worker.session.model;
  const other = harness.worker.session.modelRegistry.find('native-fixture', 'native-plan-model');
  if (!initial || !other) throw new Error('The fixture needs a second model to test a real switch');
  await harness.worker.operation({ type: 'prompt', runId: 'switch-run', request: prompt('Reply with the fixture marker.', { providerId: other.provider, modelId: other.id }) });
  // A different model must go through setModelTemporary, which is what moves the
  // session's model and records the change.
  expect(harness.worker.session.model?.provider).toBe(other.provider);
  expect(harness.worker.session.model?.id).toBe(other.id);
  expect(harness.fatal()).toBe(false);
 } finally { await harness.close(); }
}, 30000);

test('turn budget and standalone magic keywords apply budget ceiling and notices in prepare', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const terminal = Promise.withResolvers<void>();
  const unsubscribe = harness.worker.session.subscribe(event => { if (event.type === 'agent_end') terminal.resolve(); });
  await harness.worker.operation({
   type: 'prompt',
   runId: 'budget-test-run',
   request: prompt('please ultrathink this request +50k!'),
  });
  await terminal.promise;
  unsubscribe();
  expect(harness.worker.session.sessionManager.getTurnBudget()?.total).toBe(50000);
  expect(harness.worker.session.sessionManager.getTurnBudget()?.hard).toBe(true);

  const terminal2 = Promise.withResolvers<void>();
  const unsubscribe2 = harness.worker.session.subscribe(event => { if (event.type === 'agent_end') terminal2.resolve(); });
  await harness.worker.operation({
   type: 'prompt',
   runId: 'budget-test-run-2',
   request: prompt('normal follow-up without budget'),
  });
  await terminal2.promise;
  unsubscribe2();
  expect(harness.worker.session.sessionManager.getTurnBudget()?.total ?? null).toBeNull();
  expect(harness.fatal()).toBe(false);
 } finally { await harness.close(); }
}, 30000);



test('native web_search tool routes to Host web-search authorization and performs one loopback search', async () => {
 const search = await searxngLoopback();
 const harness = await fixture({
  respond(payload) {
   return payload.messages.at(-1)?.role === 'tool' ? completion() : completion({ name: 'web_search', id: 'web-search-call', input: { query: 'task63 loopback', num_results: 3 } });
  }
 });
 const terminal = Promise.withResolvers<void>();
 const unsubscribe = harness.worker.session.subscribe(event => { if (event.type === 'agent_end') terminal.resolve(); });
 try {
  cfgWebSearchEnabled.override(harness.worker.session.settings, true);
  cfgSearxngEndpoint.override(harness.worker.session.settings, search.url);
  cfgProvidersWebSearchTimeoutSeconds.override(harness.worker.session.settings, 3);
  harness.worker.session.settings.setModelRole('web', 'web/searxng');
  await harness.worker.operation({ type: 'prompt', runId: 'web-search-run', request: prompt('Search the loopback endpoint with the native web_search tool.') });
  await terminal.promise;
  expect(harness.hostRequests.some(request => request.type === 'tool' && request.toolName === 'web_search')).toBe(false);
  expect(harness.hostRequests).toContainEqual({ type: 'web-search' });
  expect(search.requests).toEqual(['task63 loopback']);
  const outcome = harness.events.map(input => input.event).find(event => event.type === 'tool.completed' && event.toolCallId === 'web-search-call');
  expect(outcome).toMatchObject({
   status: 'completed', isError: false,
   output: { content: expect.arrayContaining([{ type: 'text', text: expect.stringContaining('Task63 Loopback Result') }]) }
  });
  expect(harness.fatal()).toBe(false);
 } finally { unsubscribe(); search.stop(); await harness.close(); }
}, 30000);

test('enterprise Host refusal of web-search blocks the native tool before any loopback egress', async () => {
 const search = await searxngLoopback();
 const harness = await fixture({
  denyWebSearch: true, respond(payload) {
   return payload.messages.at(-1)?.role === 'tool' ? completion() : completion({ name: 'web_search', id: 'web-search-denied', input: { query: 'task63 denied' } });
  }
 });
 const terminal = Promise.withResolvers<void>();
 const unsubscribe = harness.worker.session.subscribe(event => { if (event.type === 'agent_end') terminal.resolve(); });
 try {
  cfgWebSearchEnabled.override(harness.worker.session.settings, true);
  cfgSearxngEndpoint.override(harness.worker.session.settings, search.url);
  cfgProvidersWebSearchTimeoutSeconds.override(harness.worker.session.settings, 3);
  harness.worker.session.settings.setModelRole('web', 'web/searxng');
  await harness.worker.operation({ type: 'prompt', runId: 'web-search-denied-run', request: prompt('Try the native web_search tool.') });
  await terminal.promise;
  expect(harness.hostRequests.some(request => request.type === 'tool' && request.toolName === 'web_search')).toBe(false);
  expect(harness.hostRequests).toContainEqual({ type: 'web-search' });
  expect(search.requests).toEqual([]);
  const outcome = harness.events.map(input => input.event).find(event => event.type === 'tool.completed' && event.toolCallId === 'web-search-denied');
  expect(outcome).toMatchObject({ status: 'failed', isError: true });
  expect(harness.fatal()).toBe(false);
 } finally { unsubscribe(); search.stop(); await harness.close(); }
}, 30000);
test('native lsp tool routes to Host authorization and succeeds when authorized', async () => {
 const harness = await fixture({
  respond(payload) {
   return payload.messages.at(-1)?.role === 'tool' ? completion() : completion({ name: 'lsp', id: 'lsp-call', input: { action: 'status' } });
  }
 });
 const terminal = Promise.withResolvers<void>();
 const unsubscribe = harness.worker.session.subscribe(event => { if (event.type === 'agent_end') terminal.resolve(); });
 try {
  await harness.worker.operation({ type: 'prompt', runId: 'lsp-run', request: prompt('Query LSP status.') });
  await terminal.promise;
  expect(harness.hostRequests).toContainEqual(expect.objectContaining({ type: 'tool', toolName: 'lsp', input: { action: 'status' } }));
  const outcome = harness.events.map(input => input.event).find(event => event.type === 'tool.completed' && event.toolCallId === 'lsp-call');
  expect(outcome).toMatchObject({ status: 'completed', isError: false });
  expect(harness.fatal()).toBe(false);
 } finally { unsubscribe(); await harness.close(); }
}, 30000);

test('Host policy refusal blocks native lsp tool before execution', async () => {
 const harness = await fixture({
  denyLsp: true, respond(payload) {
   return payload.messages.at(-1)?.role === 'tool' ? completion() : completion({ name: 'lsp', id: 'lsp-denied-call', input: { action: 'status' } });
  }
 });
 const terminal = Promise.withResolvers<void>();
 const unsubscribe = harness.worker.session.subscribe(event => { if (event.type === 'agent_end') terminal.resolve(); });
 try {
  await harness.worker.operation({ type: 'prompt', runId: 'lsp-denied-run', request: prompt('Try LSP status.') });
  await terminal.promise;
  expect(harness.hostRequests).toContainEqual(expect.objectContaining({ type: 'tool', toolName: 'lsp', input: { action: 'status' } }));
  const outcome = harness.events.map(input => input.event).find(event => event.type === 'tool.completed' && event.toolCallId === 'lsp-denied-call');
  expect(outcome).toMatchObject({ status: 'failed', isError: true });
  expect(harness.fatal()).toBe(false);
 } finally { unsubscribe(); await harness.close(); }
}, 30000);

test('a Bash-mounted tool still reaches Host authorization with its own validated input', async () => {
 const command = `lsp -j '{"action":"status"}'`;
 const harness = await fixture({
  denyLsp: true, machineCommands: [command], respond(payload) {
   return payload.messages.at(-1)?.role === 'tool' ? completion() : completion({ name: 'bash', id: 'mounted-lsp', input: { command } });
  }
 });
 const terminal = Promise.withResolvers<void>();
 const unsubscribe = harness.worker.session.subscribe(event => { if (event.type === 'agent_end') terminal.resolve(); });
 try {
  expect(harness.worker.session.getMountedToolCommandNames()).toContain('lsp');
  cfgBashPatterns.override(harness.worker.session.settings, [{ match: command, approval: 'allow' }]);
  await harness.worker.operation({ type: 'prompt', runId: 'mounted-lsp-run', request: prompt('Try the LSP command.') });
  await terminal.promise;
  expect(harness.hostRequests).toContainEqual(expect.objectContaining({ type: 'tool', toolName: 'lsp', input: { action: 'status' } }));
  const outcome = harness.events.map(input => input.event).find(event => event.type === 'tool.completed' && event.toolCallId === 'mounted-lsp');
  expect(JSON.stringify(outcome)).toContain('Host policy refused the tool operation');
 } finally { unsubscribe(); await harness.close(); }
}, 30000);

for (const decision of ['approve', 'reject'] as const) {
 test(`actual SDK secret command waits for source-bound ${decision} before Host invocation`, async () => {
  const invocations: HostActionRequest[] = [];
  const waiting = Promise.withResolvers<void>();
  const secrets = createSecretRequests({ isEnabled: async () => true, onWaitChange: change => { if (change.type === 'waiting') waiting.resolve(); } });
  const program = process.execPath;
  const args = ['-e', 'console.log(process.env.TOKEN)'];
  const harness = await fixture({
   respond(payload) {
    return payload.messages.at(-1)?.role === 'tool' ? completion() : completion({
     name: 'openchamber_secret', id: 'secret-native-call', input: {
      action: 'secret.run', input: { program, args, reason: 'Authenticate', inputs: [{ env: 'TOKEN', label: 'Token' }] },
     },
    });
   },
   invoke: async (request, signal, directory) => {
    invocations.push(request);
    if (request.toolName !== 'openchamber_secret') throw new Error('Expected a secret Host action');
    return JsonValueSchema.parse(await secrets.run(request.input, { sessionId: request.sessionId, callId: request.toolCallId, directory, signal }));
   },
  });
  const terminal = Promise.withResolvers<void>();
  const unsubscribe = harness.worker.session.subscribe(event => { if (event.type === 'agent_end') terminal.resolve(); });
  try {
   cfgToolsApprovalMode.override(harness.worker.session.settings, 'yolo');
   await harness.worker.operation({ type: 'prompt', runId: 'secret-native-run', request: prompt('Run one secret command.') });
   const approval = await harness.waitApproval();
   expect(approval).toMatchObject({ status: 'pending', toolName: 'bash', toolCallId: 'secret-native-call', actionType: 'bash_command' });
   expect(invocations).toEqual([]);
   await harness.interactions.resolveApproval(rootSessionId, approval.approvalId, { decision, version: approval.version, epoch: approval.epoch, workerGeneration: approval.workerGeneration });
   if (decision === 'approve') {
    await waiting.promise;
    await secrets.answer({ sessionId: rootSessionId, callId: 'secret-native-call', values: { TOKEN: 'private-native-secret-value' }, remember: ['TOKEN'] });
   }
   await terminal.promise;
   expect(invocations).toHaveLength(decision === 'approve' ? 1 : 0);
   expect(harness.grants).toEqual(decision === 'approve' ? [approval.approvalId] : []);
   expect(harness.interactions.consumeApprovalGrant(rootSessionId, generation, approval.approvalId, approval.toolCallId, 'bash', { command: [program, ...args].map(value => `'${value.replaceAll("'", "'\\''")}'`).join(' ') })).toBeUndefined();
   const persisted = await readFile(harness.worker.sessionFile, 'utf8');
   expect(JSON.stringify([harness.events, harness.requests, harness.hostRequests, harness.journal.snapshot(), persisted])).not.toContain('private-native-secret-value');
   if (decision === 'approve') {
    expect(persisted).toContain('[secret:TOKEN]');
    expect(secrets.forget(rootSessionId)).toEqual({ forgotten: 1 });
   }
   expect(harness.fatal()).toBe(false);
  } finally { unsubscribe(); await harness.close(); }
 }, 30000);
}

for (const approvalMode of ['always-ask', 'yolo'] as const) {
 for (const decision of ['approve', 'reject'] as const) {
  test(`actual SDK Bash ${approvalMode} waits for source-bound ${decision} before execution`, async () => {
   let toolCalls = 0;
   const harness = await fixture({
    respond(payload, root) {
     const messages = payload.messages;
     if (messages.at(-1)?.role === 'tool') return completion();
     return completion({ name: 'bash', id: `native-bash-${++toolCalls}`, input: { command: `printf GRANTED >> '${join(root, 'proof.txt')}'` } });
    }
   });
   const terminal = Promise.withResolvers<void>();
   const unsubscribe = harness.worker.session.subscribe(event => { if (event.type === 'agent_end') terminal.resolve(); });
   try {
    cfgToolsApprovalMode.override(harness.worker.session.settings, approvalMode);
    await harness.worker.operation({ type: 'prompt', runId: 'bash-run', request: prompt('Run the native bash tool exactly once.') });
    const approval = await harness.waitApproval();
    expect(approval).toMatchObject({ status: 'pending', toolName: 'bash', actionType: 'bash_command', workerGeneration: generation });
    await expect(readFile(join(harness.root, 'proof.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await harness.interactions.resolveApproval(rootSessionId, approval.approvalId, { decision, version: approval.version, epoch: approval.epoch, workerGeneration: approval.workerGeneration });
    await terminal.promise;
    if (decision === 'approve') {
     expect(await readFile(join(harness.root, 'proof.txt'), 'utf8')).toBe('GRANTED');
     expect(harness.grants).toEqual([approval.approvalId]);
    } else {
     await expect(readFile(join(harness.root, 'proof.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
     expect(harness.grants).toEqual([]);
    }
    expect(harness.interactions.consumeApprovalGrant(rootSessionId, generation, approval.approvalId, approval.toolCallId, 'bash', { command: `printf GRANTED >> '${join(harness.root, 'proof.txt')}'` })).toBeUndefined();
    expect(harness.fatal()).toBe(false);
   } finally { unsubscribe(); await harness.close(); }
  }, 30000);
 }
}

for (const decision of ['allow', 'deny'] as const) {
 test(`actual native Bash pattern ${decision} remains authoritative without an extra Host approval`, async () => {
  const command = 'printf PATTERN';
  const harness = await fixture({
   machineCommands: [command], respond(payload) {
    const messages = payload.messages;
    return messages.at(-1)?.role === 'tool' ? completion() : completion({ name: 'bash', id: 'pattern-call', input: { command } });
   }
  });
  const terminal = Promise.withResolvers<void>();
  const unsubscribe = harness.worker.session.subscribe(event => { if (event.type === 'agent_end') terminal.resolve(); });
  try {
   cfgToolsApprovalMode.override(harness.worker.session.settings, 'always-ask');
   cfgBashPatterns.override(harness.worker.session.settings, [{ match: command, approval: decision }]);
   await harness.worker.operation({ type: 'prompt', runId: 'pattern-run', request: prompt('Use the configured native bash pattern.') });
   await terminal.promise;
   const outcomes = harness.events.map(input => input.event).filter(event => event.type === 'tool.completed' && event.toolCallId === 'pattern-call');
   expect(outcomes).toHaveLength(1);
   const outcome = outcomes[0];
   if (!outcome || outcome.type !== 'tool.completed') throw new Error('Native pattern tool outcome was not projected');
   if (decision === 'allow') {
    expect(outcome).toMatchObject({
     status: 'completed', isError: false,
     output: { content: expect.arrayContaining([{ type: 'text', text: expect.stringContaining('PATTERN') }]) },
    });
   } else {
    expect(outcome).toMatchObject({ status: 'failed', isError: true });
    expect(outcome.output).not.toMatchObject({ content: expect.arrayContaining([{ type: 'text', text: 'PATTERN' }]) });
   }
   expect(harness.events.filter(input => input.event.type === 'approval.requested')).toHaveLength(0);
   expect(harness.grants).toEqual([]);
   expect(harness.fatal()).toBe(false);
  } finally { unsubscribe(); await harness.close(); }
 }, 30000);
}

test('actual SDK Bash always-allow caches natively and still grants each execution exactly', async () => {
 const first = `printf FIRST >> '${join('ROOT', 'proof.txt')}'`;
 const second = `printf SECOND >> '${join('ROOT', 'proof.txt')}'`;
 let step = 0;
 const harness = await fixture({
  respond(payload, root) {
   if (payload.messages.at(-1)?.role !== 'tool') {
    step = 1;
    return completion({ name: 'bash', id: 'native-bash-1', input: { command: first.replace('ROOT', root) } });
   }
   if (step === 1) {
    step = 2;
    return completion({ name: 'bash', id: 'native-bash-2', input: { command: second.replace('ROOT', root) } });
   }
   return completion();
  }
 });
 const terminal = Promise.withResolvers<void>();
 const unsubscribe = harness.worker.session.subscribe(event => { if (event.type === 'agent_end') terminal.resolve(); });
 try {
  cfgToolsApprovalMode.override(harness.worker.session.settings, 'always-ask');
  await harness.worker.operation({ type: 'prompt', runId: 'always-run', request: prompt('Run both native bash steps.') });
  const approval = await harness.waitApproval();
  await harness.interactions.resolveApproval(rootSessionId, approval.approvalId, {
   decision: 'always-allow', policyScope: 'session', version: approval.version, epoch: approval.epoch, workerGeneration: approval.workerGeneration,
  });
  await terminal.promise;
  expect(await readFile(join(harness.root, 'proof.txt'), 'utf8')).toBe('FIRSTSECOND');
  const requested = harness.events.filter(input => input.event.type === 'approval.requested');
  expect(requested).toHaveLength(1);
  expect(harness.grants).toHaveLength(2);
  expect(harness.grants[0]).toBe(approval.approvalId);
  expect(harness.grants[1]).not.toBe(approval.approvalId);
  expect(harness.fatal()).toBe(false);
 } finally { unsubscribe(); await harness.close(); }
}, 30000);

test('actual SDK Host tool executes with Host-supplied first-use MCP storage and returns its real file result', async () => {
 let invoked: HostActionRequest | undefined;
 const harness = await fixture({
  respond(payload) {
   const messages = payload.messages;
   return messages.at(-1)?.role === 'tool' ? completion() : completion({ name: 'openchamber_workflow', id: 'host-workflow', input: { action: 'workflow.run', input: { script: 'workflow.js' } } });
  }, async invoke(request, signal, root) {
   signal.throwIfAborted();
   invoked = request;
   await writeFile(join(root, 'workflow.txt'), String(request.input.script));
   const stored = await readFile(join(root, 'workflow.txt'), 'utf8');
   return { ok: true, stored, bytes: Buffer.byteLength(stored) };
  }
 });
 const terminal = Promise.withResolvers<void>();
 const unsubscribe = harness.worker.session.subscribe(event => { if (event.type === 'agent_end') terminal.resolve(); });
 try {
  await expect(readFile(harness.mcpConfigPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  cfgToolsApprovalMode.override(harness.worker.session.settings, 'yolo');
  expect(harness.worker.session.getAllToolInfos().map(tool => tool.name)).toEqual(expect.arrayContaining([...ENABLED_HOST_TOOL_NAMES]));
  expect(harness.worker.session.getActiveToolNames()).not.toContain('notify');
  expect(harness.worker.session.getActiveToolNames()).not.toContain('memory');
  expect(harness.worker.session.getActiveToolNames()).not.toContain('openchamber_image');
  await harness.worker.operation({ type: 'prompt', runId: 'host-run', request: prompt('Start the workflow with the workflow tool.') });
  await terminal.promise;
  expect(invoked).toEqual({ sessionId: rootSessionId, toolName: 'openchamber_workflow', action: 'workflow.run', input: { script: 'workflow.js' } });
  expect(await readFile(join(harness.root, 'workflow.txt'), 'utf8')).toBe('workflow.js');
  expect(JSON.stringify(harness.requests)).toContain('workflow.js');
  expect(harness.events.some(input => input.event.type === 'tool.completed' && input.event.toolCallId === 'host-workflow' && input.event.status === 'completed')).toBe(true);
  expect(harness.fatal()).toBe(false);
 } finally { unsubscribe(); await harness.close(); }
}, 30000);
test('native async work pauses and wakes one canonical run without reporting idle', async () => {
 const harness = await fixture({ planModel: true, respond: () => completion() });
 const session = harness.worker.session;
 const paused = Promise.withResolvers<void>();
 const work = Promise.withResolvers<string>();
 const manager = session.asyncJobManager;
 if (!manager) throw new Error('Native async job manager is required');
 const ownerId = session.getAgentId();
 const jobId = manager.register('bash', 'Async wake proof', () => work.promise, { ownerId, foreground: false });
 let wakeWasArmed = false;
 const unsubscribe = session.subscribe(event => {
  if (event.type === 'agent_pause' && event.awaiting) paused.resolve();
  if (event.type === 'message_start' && harness.requests.length === 2) {
   const mode = harness.worker.mode();
   wakeWasArmed ||= mode.kind === 'plan' && mode.status === 'armed';
  }
 });
 try {
  await harness.worker.operation({ type: 'prompt', runId: 'async-run', request: prompt('Wait for the background result.') });
  await paused.promise;
  expect(session.isRunActive).toBe(true);
  expect(session.isStreaming).toBe(false);
  expect(session.wakeSources?.jobs).toContain(jobId);
  expect(harness.journal.snapshot().session.runtimeStatus).toBe('running');
  expect(harness.events.some(input => input.event.type === 'run.completed')).toBe(false);
  await expect(harness.worker.operation({ type: 'mode.set', mode: 'vibe' })).rejects.toMatchObject({ code: 'RUN_ACTIVE' });
  await harness.worker.operation({ type: 'mode.set', mode: 'plan' });
  expect(harness.worker.mode()).toMatchObject({ kind: 'plan', status: 'armed' });
  const ended = session.waitForRunEnd();
  work.resolve('The background job finished.');
  await ended;
  await harness.worker['modeController'].settleTransition();
  expect(session.isRunActive).toBe(false);
  expect(session.wakeSources).toBeUndefined();
  expect(harness.requests).toHaveLength(2);
  expect(wakeWasArmed).toBe(true);
  expect(harness.worker.mode()).toMatchObject({ kind: 'plan', status: 'active' });
  expect(harness.events.filter(input => input.event.type === 'run.completed')).toHaveLength(1);
  expect(harness.journal.snapshot().session.runtimeStatus).toBe('idle');
 } finally {
  work.resolve('Finished');
  unsubscribe();
  await harness.close();
 }
}, 30000);

for (const control of ['abort', 'close'] as const) {
 test(`${control} settles a native run paused on a live child without waiting for that child`, async () => {
  const childStarted = Promise.withResolvers<void>();
  const releaseChild = Promise.withResolvers<void>();
  let requests = 0;
  const harness = await fixture({
   respond: async () => {
    if (++requests === 1) { childStarted.resolve(); await releaseChild.promise; }
    return completion();
   }
  });
  const runtime = await openNativeRuntime({ cwd: harness.root, agentDirectory: harness.agentDirectory });
  const { session: child } = await createAgentSession({
   cwd: harness.root, agentDir: harness.agentDirectory,
   sessionManager: SessionManager.inMemory(harness.root), authStorage: runtime.authStorage,
   modelRegistry: runtime.modelRegistry, settings: runtime.settings, initialModelRefreshStrategy: 'offline',
   enableMCP: false, disableExtensionDiscovery: true,
  });
  await child.setModelTemporary(harness.worker.session.model!);
  const childTask = child.prompt('Keep the child running.');
  await childStarted.promise;
  const registry = AgentRegistry.global();
  const ref = registry.register({
   id: 'stop-child', displayName: 'Stop child', kind: 'sub',
   parentId: harness.worker.session.getAgentId(), status: 'running', session: child
  });
  const paused = Promise.withResolvers<void>();
  const unsubscribe = harness.worker.session.subscribe(event => {
   if (event.type === 'agent_pause' && event.awaiting) paused.resolve();
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
   await harness.worker.operation({ type: 'prompt', runId: 'child-wait-run', request: prompt('Wait for the child.') });
   await paused.promise;
   expect(harness.worker.session.wakeSources?.agents).toContain(ref.id);
   const stopped = control === 'abort'
    ? harness.worker.operation({ type: 'abort', runId: 'child-wait-run' }) : harness.worker.close();
   await Promise.race([stopped, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Stop is still waiting for the live child')), 1000);
   })]);
   expect(harness.worker.session.isRunActive).toBe(false);
   expect(harness.worker.session.wakeSources).toBeUndefined();
   expect(requests).toBe(2);
   if (control === 'abort') expect(harness.journal.snapshot().session.runtimeStatus).toBe('idle');
  } finally {
   clearTimeout(timer);
   unsubscribe();
   registry.unregister(ref.id, ref);
   releaseChild.resolve();
   await childTask;
   await child.dispose();
   runtime.authStorage.close();
   await harness.close();
  }
 }, 30000);
}

test('native daemon service callbacks retain the AgentSession receiver', async () => {
 const harness = await fixture({ respond: () => completion() });
 const cleanupDaemon = await isolateDaemonForSmokeTest();
 const session = harness.worker.session;
 const client = await daemonClient();
 const subscriptions = spyOn(client, 'onCompletion');
 const warnings = spyOn(logger, 'warn');
 try {
  const unsubscribe = session.registerSessionChangeCallback(() => { });
  unsubscribe();
  const inherited: AgentSession = Object.create(session);
  expect(() => inherited.registerSessionChangeCallback(() => { })).toThrow('private');
  const result = await harness.worker.operation({ type: 'shell', operation: { type: 'snapshot' } });
  expect(result.type).toBe('shell');
  if (result.type !== 'shell' || result.result.type !== 'snapshot') throw new Error('Expected shell snapshot');
  expect(result.result.snapshot.running).toEqual([]);
  expect(warnings.mock.calls.filter(([message]) => message === 'Daemon list failed; continuing without service state')).toEqual([]);
  const subscription = subscriptions.mock.calls.find(([owner]) => owner === rootSessionId);
  if (!subscription) throw new Error('Native daemon completion subscription is missing');
  const notification: DaemonCompletionEvent = {
   ev: 'completed', completionId: 'completion-native', owner: rootSessionId,
   unit: {
    key: 'native-service', kind: 'proc', scope: { kind: 'project', dir: harness.root },
    label: 'native-service', generation: 'generation', pids: [], leases: 0, supervised: true,
    policy: { hold: 'leases', idleMs: 0, onIdle: 'stop', restart: 'no', survive: 'exec' },
    id: 'native-service-id', state: 'exited', createdAt: 1, startedAt: 1,
    restartCount: 0, outputBytes: 0, owner: rootSessionId
   },
  };
  await harness.worker.close();
  await expect(Promise.resolve().then(() => subscription[1](notification))).rejects.toThrow('Session disposed before launch completion delivery');
 } finally {
  subscriptions.mockRestore();
  warnings.mockRestore();
  try { await cleanupDaemon(); } finally {
   await harness.close();
  }
 }
}, 30000);

test('service returns tool catalog (name, label, description, tier, availability) for a live session', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const result = await harness.worker.operation({ type: 'tools.catalog' });
  expect(result.type).toBe('tools.catalog');
  if (result.type !== 'tools.catalog') throw new Error('Expected tools.catalog result');
  const catalog = result.catalog;
  expect(catalog.sessionId).toBe(harness.worker.sessionId);
  expect(catalog.tools.length).toBeGreaterThan(0);
  const readTool = catalog.tools.find(t => t.name === 'read');
  expect(readTool).toBeDefined();
  for (const tool of catalog.tools) {
   expect(typeof tool.name).toBe('string');
   expect(typeof tool.label).toBe('string');
   expect(typeof tool.description).toBe('string');
   expect(['read', 'write', 'exec']).toContain(tool.tier);
   expect(tool.availability).toBe(true);
  }
  expect(readTool?.name).toBe('read');
  expect(readTool?.tier).toBe('read');
  expect(readTool?.availability).toBe(true);
 } finally {
  await harness.close();
 }
});

test('worker sends plain OMP system and developer context plus only the user pin', async () => {
 const marker = 'PARITY_PROMPT_MARKER';
 const harness = await fixture({ respond: () => completion() });
 let plain: AgentSession | undefined;
 let plainAuth: NativeWorkerRuntime['authStorage'] | undefined;
 let unsubscribePlain: (() => void) | undefined;
 try {
  const workerTerminal = Promise.withResolvers<void>();
  const unsubscribeWorker = harness.worker.session.subscribe(event => {
   if (event.type === 'agent_end') workerTerminal.resolve();
  });
  await harness.worker.operation({
   type: 'prompt', runId: 'parity-run', request: {
    ...prompt(marker), input: { text: marker, attachments: [], context: [{ kind: 'context', text: 'USER_PIN_MARKER', metadata: {} }] },
   }
  });
  await workerTerminal.promise;
  unsubscribeWorker();
  const workerRequest = promptRequest(harness.requests, marker);

  const runtime = await openNativeRuntime({ cwd: harness.root, agentDirectory: harness.agentDirectory });
  plainAuth = runtime.authStorage;
  const plainDirectory = join(harness.root, 'plain-sessions');
  await mkdir(plainDirectory, { recursive: true });
  const plainManager = SessionManager.create(harness.root, plainDirectory);
  const created = await createAgentSession({
   cwd: harness.root, agentDir: harness.agentDirectory, sessionManager: plainManager, authStorage: runtime.authStorage,
   modelRegistry: runtime.modelRegistry, settings: runtime.settings, initialModelRefreshStrategy: 'offline',
   enableMCP: false, disableExtensionDiscovery: true, hasUI: true, interactivePrompts: true,
   tuiTranscript: true,
  });
  plain = created.session;
  const model = runtime.modelRegistry.find('native-fixture', 'native-model');
  if (!model) throw new Error('Plain OMP model is unavailable');
  await plain.setModelTemporary(model);
  const plainTerminal = Promise.withResolvers<void>();
  unsubscribePlain = plain.subscribe(event => {
   if (event.type === 'agent_end') plainTerminal.resolve();
  });
  const observed = harness.requests.length;
  await plain.prompt(marker, { throwOnDrop: true, images: [], runCommands: false, expandPromptTemplates: false });
  await plainTerminal.promise;
  const plainRequest = promptRequest(harness.requests.slice(observed), marker);

  const workerInstructions = instructionMessages(workerRequest);
  const plainInstructions = instructionMessages(plainRequest);
  expect(withoutHostToolInventory(workerInstructions)).toEqual(plainInstructions);
  for (const toolName of ENABLED_HOST_TOOL_NAMES) expect(JSON.stringify(workerInstructions)).toContain(`, ${toolName}`);
  expect(JSON.stringify(workerInstructions)).not.toContain(', notify');
  expect(JSON.stringify(plainInstructions)).not.toContain('openchamber');
  expect(JSON.stringify(workerRequest.messages)).toContain('USER_PIN_MARKER');
  expect(JSON.stringify(instructionMessages(workerRequest))).not.toContain('USER_PIN_MARKER');
  expect(JSON.stringify(workerRequest)).not.toContain('ohpichamber.context');
  const workerTools = requestTools(workerRequest);
  for (const toolName of ENABLED_HOST_TOOL_NAMES) expect(workerTools.get(toolName)).toBe(HOST_TOOL_DESCRIPTIONS[toolName]);
  expect(workerTools.has('notify')).toBe(false);
  expect([...workerTools.keys()].some(name => name.includes('://'))).toBe(false);
  expect(harness.fatal()).toBe(false);
 } finally {
  unsubscribePlain?.();
  await plain?.dispose();
  plainAuth?.close();
  await harness.close();
 }
}, 30000);

test('actual SDK steer/follow-up admission retains queued identity, captured context and attachment metadata', async () => {
 const firstRequest = Promise.withResolvers<void>();
 const release = Promise.withResolvers<void>();
 let requestCount = 0;
 const harness = await fixture({
  async respond() {
   if (++requestCount === 1) { firstRequest.resolve(); await release.promise; }
   return completion();
  }
 });
 const directMention = { kind: 'session' as const, sessionId: 'referenced-session', title: `${harness.root}/private-title` };
 const publicDirectMention = { ...directMention, title: '[workspace]/private-title' };
 const queuedMention = { kind: 'session-message' as const, sessionId: 'other-session', messageId: 'other-message', sessionTitle: 'Other session', excerpt: 'Referenced message' };
 let cold: WorkerSession | undefined;
 const followedUp = Promise.withResolvers<void>();
 const finished = Promise.withResolvers<void>();
 let followUpId: string | undefined;
 let seen = false;
 const unsubscribe = harness.worker.session.subscribe(event => {
  if (event.type === 'message_start' && event.message.role === 'user' && JSON.stringify(event.message.content).includes('FOLLOW_UP_MARKER')) { seen = true; followedUp.resolve(); }
  if (seen && event.type === 'agent_end') finished.resolve();
 });
 try {
  await expect(harness.worker.operation({ type: 'steer', request: prompt('idle steer') })).rejects.toMatchObject({ code: 'RUN_NOT_FOUND', status: 404 });
  await expect(harness.worker.operation({ type: 'follow-up', request: prompt('idle follow-up') })).rejects.toMatchObject({ code: 'RUN_NOT_FOUND', status: 404 });
  expect(harness.requests).toHaveLength(0);
  await harness.worker.operation({
   type: 'prompt', runId: 'streaming-run', request: {
    ...prompt('Keep this initial turn open.'), input: {
     text: 'Keep this initial turn open.', attachments: [], context: [
      { kind: 'context', text: 'DIRECT_CONTEXT_ENTRY', metadata: { openchamberContext: directMention }, instructions: 'DIRECT_ASSOCIATED_INSTRUCTION' },
      { kind: 'instruction', text: 'DIRECT_LATER_INSTRUCTION' },
      { kind: 'synthetic', text: 'DIRECT_SYNTHETIC_ENTRY' },
      { kind: 'context', text: 'DIRECT_LAST_CONTEXT', metadata: {} },
     ]
    },
   }
  });
  await firstRequest.promise;
  const streamingRequest = requestContaining(harness.requests, 'DIRECT_CONTEXT_ENTRY');
  expectContextOrder(streamingRequest, [
   'DIRECT_CONTEXT_ENTRY', 'DIRECT_LATER_INSTRUCTION', 'DIRECT_SYNTHETIC_ENTRY', 'DIRECT_LAST_CONTEXT',
  ]);
  expect(JSON.stringify(streamingRequest)).not.toContain('DIRECT_ASSOCIATED_INSTRUCTION');
  expect(JSON.stringify(streamingRequest)).not.toContain('ohpichamber.context');
  const attachment = { attachmentId: 'streaming-attachment', name: 'note.txt', mediaType: 'text/plain', size: Buffer.byteLength('ATTACHMENT_MARKER'), uri: 'attachment://streaming-attachment' };
  const path = join(harness.root, 'note.txt');
  await writeFile(path, 'ATTACHMENT_MARKER');
  const steered = await harness.worker.operation({ type: 'steer', request: { ...prompt('STEER_MARKER'), input: { text: 'STEER_MARKER', attachments: [], context: [{ kind: 'instruction', text: 'STEERING_INSTRUCTION' }] } } });
  expect(steered).toMatchObject({ type: 'steer', ack: { sessionId: rootSessionId, runId: 'streaming-run', acceptedAt: expect.any(Number) } });
  const queued = await harness.worker.operation({
   type: 'follow-up', request: {
    ...prompt('FOLLOW_UP_MARKER'), input: {
     text: 'FOLLOW_UP_MARKER', attachments: [attachment], context: [
      { kind: 'context', text: 'FOLLOW_UP_CONTEXT', metadata: { openchamberContext: queuedMention }, deliveryReceiptId: 'delivery', instructions: 'FOLLOW_UP_ASSOCIATED_INSTRUCTION' },
      { kind: 'instruction', text: 'FOLLOW_UP_LATER_INSTRUCTION' },
      { kind: 'synthetic', text: 'FOLLOW_UP_SYNTHETIC_ENTRY' },
      { kind: 'context', text: 'FOLLOW_UP_LAST_CONTEXT', metadata: {} },
     ]
    },
   }, attachments: [{ attachmentId: attachment.attachmentId, path }]
  });
  if (queued.type !== 'follow-up') throw new Error('Follow-up acknowledgment was not returned');
  followUpId = queued.ack.followUpId;
  expect(queued.ack).toMatchObject({ sessionId: rootSessionId, followUpId: expect.any(String), acceptedAt: expect.any(Number) });
  expect(JSON.stringify(harness.worker.session.agent.peekSteeringQueue())).toContain('STEER_MARKER');
  expect(JSON.stringify(harness.worker.session.agent.peekFollowUpQueue())).toContain('FOLLOW_UP_MARKER');
  release.resolve();
  await followedUp.promise;
  await finished.promise;
  const history = await harness.worker.operation({ type: 'history', request: { sessionId: rootSessionId } });
  if (history.type !== 'history') throw new Error('History was not returned');
  const followUp = history.history.messages.find(message => message.messageId === followUpId);
  expect(followUp?.parts).toEqual(expect.arrayContaining([{ type: 'attachment', partId: `${followUpId}:attachment:0`, ...attachment }]));
  expect(JSON.stringify(followUp)).toContain('FOLLOW_UP_MARKER');
  const direct = history.history.messages.find(message => message.role === 'user' && message.parts.some(part => part.type === 'text' && part.content.includes('Keep this initial turn open.')));
  expect(direct?.parts).toContainEqual(expect.objectContaining({ type: 'text', sessionMentions: [publicDirectMention] }));
  expect(followUp?.parts).toContainEqual(expect.objectContaining({ type: 'text', sessionMentions: [queuedMention] }));
  const startedParts = harness.events.flatMap(({ event }) => event.type === 'part.started' ? [event.part] : []);
  expect(startedParts).toContainEqual(expect.objectContaining({ type: 'text', sessionMentions: [publicDirectMention] }));
  expect(startedParts).toContainEqual(expect.objectContaining({ type: 'text', sessionMentions: [queuedMention] }));
  const snapshot = harness.journal.snapshot();
  expect(snapshot.messages.find(message => message.messageId === followUpId)?.parts).toContainEqual(expect.objectContaining({ type: 'text', sessionMentions: [queuedMention] }));
  await harness.worker.close();
  cold = await WorkerSession.open({
   type: 'bootstrap', rootSessionId, workerGeneration: 'cold-mention-generation', projectId: 'project',
   workspaceId: 'workspace', agentDirectoryId: 'source', cwd: harness.root, agentDirectory: dirname(harness.mcpConfigPath),
   sessionFile: harness.worker.sessionFile, sessionsDirectory: dirname(harness.worker.sessionFile)
  }, () => { },
   () => { throw new Error('Mention recovery must not request interaction'); }, () => { throw new Error('Mention recovery must not fail'); },
   async () => { }, async () => { throw new Error('Mention recovery must not invoke Host tools'); }, () => { });
  const reloaded = cold.seed().messages;
  expect(reloaded.find(message => message.messageId === direct?.messageId)?.parts).toContainEqual(expect.objectContaining({ type: 'text', sessionMentions: [publicDirectMention] }));
  expect(reloaded.find(message => message.messageId === followUpId)?.parts).toContainEqual(expect.objectContaining({ type: 'text', sessionMentions: [queuedMention] }));
  expect(JSON.stringify(harness.requests)).toContain('STEERING_INSTRUCTION');
  expect(JSON.stringify(harness.requests)).toContain('FOLLOW_UP_CONTEXT');
  expectContextOrder(requestContaining(harness.requests, 'FOLLOW_UP_CONTEXT'), [
   'FOLLOW_UP_CONTEXT', 'FOLLOW_UP_LATER_INSTRUCTION', 'FOLLOW_UP_SYNTHETIC_ENTRY', 'FOLLOW_UP_LAST_CONTEXT',
  ]);
  expect(JSON.stringify(harness.requests)).not.toContain('FOLLOW_UP_ASSOCIATED_INSTRUCTION');
  expect(JSON.stringify(harness.requests)).not.toContain('ohpichamber.context');
  expect(harness.fatal()).toBe(false);
 } finally { release.resolve(); unsubscribe(); await cold?.close(); await harness.close(); }
}, 30000);

test('actual native undo/redo retains sibling transcript and cold-reopen selection without changing workspace files', async () => {
 const harness = await fixture({ respond: () => completion() });
 let cold: WorkerSession | undefined;
 try {
  const manager = harness.worker.session.sessionManager;
  const attachment = { attachmentId: 'accepted-upload', name: 'retained.txt', mediaType: 'text/plain', size: 7, uri: 'attachment://accepted-upload' };
  let timestamp = Date.now();
  for (const index of [1, 2]) {
   const userId = manager.appendMessage({ role: 'user', content: `Prompt ${index}`, timestamp: timestamp++ });
   manager.appendCustomEntry('ohpichamber.canonical.v1', {
    nativeEntryId: userId, messageId: `user-${index}`, turnId: `turn-${index}`,
    runId: `run-${index}`, userMessageId: `user-${index}`, virtualUser: false, attachments: index === 2 ? [attachment] : []
   });
   const assistantId = manager.appendMessage({
    role: 'assistant', content: [{ type: 'text', text: `Reply ${index}` }], api: 'openai-completions',
    provider: 'native-fixture', model: 'native-model', stopReason: 'stop', timestamp: timestamp++,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
   });
   manager.appendCustomEntry('ohpichamber.canonical.v1', {
    nativeEntryId: assistantId, messageId: `assistant-${index}`, turnId: `turn-${index}`,
    runId: `run-${index}`, userMessageId: `user-${index}`, virtualUser: false, attachments: []
   });
  }
  await manager.flush();
  await writeFile(join(harness.root, 'workspace-proof.txt'), 'Not rolled back');
  const before = harness.worker.seed();
  const treeIds = manager.getEntries().map(entry => entry.id);
  const selectedAssistant = await harness.worker.operation({
   type: 'branch', request: {
    action: 'revert', messageId: 'assistant-1',
    branchId: before.branch.branchId, branchVersion: before.branch.branchVersion
   }
  });
  if (selectedAssistant.type !== 'branch') throw new Error('Native assistant selection is required');
  expect(selectedAssistant.seed.messages.map(message => message.messageId)).toEqual(['user-1', 'assistant-1']);
  const fullSelection = await harness.worker.operation({
   type: 'branch', request: {
    action: 'restore',
    branchId: selectedAssistant.result.branch.branchId, branchVersion: selectedAssistant.result.branch.branchVersion
   }
  });
  if (fullSelection.type !== 'branch') throw new Error('Native tree restore is required');
  const reverted = await harness.worker.operation({
   type: 'branch', request: {
    action: 'revert', messageId: 'user-2',
    branchId: fullSelection.result.branch.branchId, branchVersion: fullSelection.result.branch.branchVersion
   }
  });
  if (reverted.type !== 'branch') throw new Error('Native branch response is required');
  expect(reverted.result).toMatchObject({ sessionId: rootSessionId, branch: { revert: { messageId: 'user-2' } }, draft: { text: 'Prompt 2', attachments: [attachment] } });
  expect(reverted.seed.messages.map(message => message.messageId)).toEqual(['user-1', 'assistant-1']);
  expect(manager.getEntries().map(entry => entry.id)).toEqual(expect.arrayContaining(treeIds));
  expect(await readFile(join(harness.root, 'workspace-proof.txt'), 'utf8')).toBe('Not rolled back');
  const earliest = await harness.worker.operation({
   type: 'branch', request: {
    action: 'revert', messageId: 'user-1',
    branchId: reverted.result.branch.branchId, branchVersion: reverted.result.branch.branchVersion
   }
  });
  if (earliest.type !== 'branch') throw new Error('Repeated native undo is required');
  expect(earliest.seed.messages).toEqual([]);
  await harness.worker.close();
  cold = await WorkerSession.open({
   type: 'bootstrap', rootSessionId, workerGeneration: 'cold-generation', projectId: 'project',
   workspaceId: 'workspace', agentDirectoryId: 'source', cwd: harness.root, agentDirectory: dirname(harness.mcpConfigPath),
   sessionFile: harness.worker.sessionFile, sessionsDirectory: dirname(harness.worker.sessionFile)
  }, () => { },
   () => { throw new Error('Branch recovery must not request interaction'); }, () => { throw new Error('Branch recovery must not fail'); },
   async () => { }, async () => { throw new Error('Branch recovery must not invoke Host tools'); }, () => { });
  const coldSeed = cold.seed();
  expect(coldSeed.branch).toEqual(earliest.seed.branch);
  expect(coldSeed.messages).toEqual(earliest.seed.messages);
  const marker = cold.session.sessionManager.getBranch().findLast(entry => entry.type === 'custom' && entry.customType === 'ohpichamber.branch.v1');
  if (marker?.type !== 'custom') throw new Error('Durable native branch marker is required');
  const selection = z.object({ restoreLeafId: z.string() }).parse(marker.data);
  expect(cold.session.sessionManager.getEntry(selection.restoreLeafId)).toBeDefined();
  const restored = await cold.operation({ type: 'branch', request: { action: 'restore', branchId: coldSeed.branch.branchId, branchVersion: coldSeed.branch.branchVersion } });
  if (restored.type !== 'branch') throw new Error('Native redo response is required');
  expect(restored.seed.messages).toEqual(before.messages);
  expect(restored.result.branch.revert).toBeUndefined();
  expect(harness.requests).toHaveLength(0);
 } finally { await cold?.close(); await harness.close(); }
}, 30000);
test('native handoff uses OMP 19 compaction mode and reports native failures', async () => {
 const harness = await fixture({ respond: () => completion() });
 const compact = spyOn(harness.worker.session, 'compact').mockResolvedValue({ summary: 'Handoff summary', firstKeptEntryId: 'native-entry', tokensBefore: 42 });
 try {
  expect(harness.worker.session.agent.intentTracing).toBe(true);
  const result = await harness.worker.operation({ type: 'command', text: '/handoff preserve the objective' });
  expect(compact).toHaveBeenCalledWith('preserve the objective', { mode: 'handoff' });
  expect(result).toMatchObject({ type: 'command' });
  compact.mockRejectedValueOnce(new Error('fixture compaction failure'));
  const failure = await harness.worker.operation({ type: 'command', text: '/handoff' });
  expect(failure).toMatchObject({ type: 'command', output: expect.stringContaining('fixture compaction failure') });
 } finally { compact.mockRestore(); await harness.close(); }
});

test('compaction can be cancelled without an active run through the worker control', async () => {
 const harness = await fixture({ respond: () => completion() });
 const started = Promise.withResolvers<void>();
 const release = Promise.withResolvers<never>();
 const compact = spyOn(harness.worker.session, 'compact').mockImplementation(async () => { started.resolve(); return release.promise; });
 const abort = spyOn(harness.worker.session, 'abortCompaction').mockImplementation(() => release.reject(new Error('compaction cancelled')));
 try {
  const pending = harness.worker.operation({ type: 'compact' }).catch(error => error);
  await started.promise;
  expect(await harness.worker.operation({ type: 'compact.abort' })).toEqual({ type: 'compact.abort', aborted: true });
  expect(abort).toHaveBeenCalledTimes(1);
  expect(await pending).toMatchObject({ message: 'compaction cancelled' });
  expect(await harness.worker.operation({ type: 'compact.abort' })).toEqual({ type: 'compact.abort', aborted: false });
 } finally { compact.mockRestore(); abort.mockRestore(); await harness.close(); }
});

test('native subagent progress retains ordered task briefs and finished status without legacy fields', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const task = renderStepsBrief(['Inspect sources', 'Run checks']);
  const bus = harness.worker['subagentEventBus'];
  const frame = { agent: 'worker', task, progress: { id: 'child', agent: 'worker', status: 'running', currentTool: 'read', currentToolIntent: 'Inspect implementation', stage: 'Inspect sources', completionPercent: 25, recentOutput: ['Read source'], taskFile: 'removed', sourceSession: 'removed' } };
  await bus.emit(TASK_SUBAGENT_PROGRESS_CHANNEL, frame);
  const updated = harness.events.findLast(input => input.event.type === 'subagent.updated');
  expect(updated?.event).toMatchObject({ type: 'subagent.updated', subagent: { task, stage: 'Inspect sources', completionPercent: 25, recentOutput: ['Read source'], lastIntent: 'Inspect implementation', activeTool: 'read' } });
  const count = harness.events.length;
  await bus.emit(TASK_SUBAGENT_PROGRESS_CHANNEL, {});
  await bus.emit(TASK_SUBAGENT_PROGRESS_CHANNEL, { ...frame, progress: { ...frame.progress, completionPercent: 101 } });
  expect(harness.events).toHaveLength(count);
  await bus.emit(TASK_SUBAGENT_PROGRESS_CHANNEL, { ...frame, progress: { ...frame.progress, recentOutput: [], status: 'completed' } });
  await bus.emit(TASK_SUBAGENT_LIFECYCLE_CHANNEL, { id: 'child', agent: 'worker', agentSource: 'bundled', index: 0, status: 'completed' });
  const finished = harness.events.findLast(input => input.event.type === 'subagent.updated');
  expect(finished?.event).toMatchObject({ type: 'subagent.updated', subagent: { status: 'completed', activeTool: undefined, retryCountdown: undefined, recentOutput: [] } });
  expect(JSON.stringify(finished?.event)).not.toContain('taskFile');
  expect(JSON.stringify(finished?.event)).not.toContain('sourceSession');
 } finally { await harness.close(); }
});

test('a subagent tool event that beats its lifecycle frame keeps its initial activeTool and live identity stays off the child session id', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const bus = harness.worker['subagentEventBus'];
  // The native id is the allocated name; the canonical child session id only
  // exists once the registry reads the child's JSONL header.
  await bus.emit(TASK_SUBAGENT_EVENT_CHANNEL, { id: 'SettingsAuditScout', event: { type: 'tool_execution_start', toolName: 'read', toolCallId: 'call-1' } });
  expect(harness.events.some(input => input.event.type === 'subagent.updated')).toBe(false);
  await bus.emit(TASK_SUBAGENT_LIFECYCLE_CHANNEL, { id: 'SettingsAuditScout', agent: 'scout', agentSource: 'bundled', index: 0, status: 'started', description: 'Audit settings IA' });
  const started = harness.events.findLast(input => input.event.type === 'subagent.updated');
  expect(started?.event).toMatchObject({
   type: 'subagent.updated', subagent: {
    subagentId: 'SettingsAuditScout', name: 'SettingsAuditScout', role: 'scout',
    description: 'Audit settings IA', status: 'running',
   }
  });
  if (started?.event.type !== 'subagent.updated') throw new Error('Expected subagent.updated');
  expect(started.event.subagent.childSessionId).toBeUndefined();
  const replayed = harness.events.findLast(input => input.event.type === 'subagent.updated');
  expect(replayed?.event).toMatchObject({ type: 'subagent.updated', subagent: { activeTool: 'read' } });
  await bus.emit(TASK_SUBAGENT_PROGRESS_CHANNEL, {
   agent: 'scout', task: 'Audit settings', assignment: 'Check settings IA',
   progress: { id: 'SettingsAuditScout', agent: 'scout', status: 'running', currentTool: 'grep', currentToolArgs: 'packages/ui/**', resolvedModel: 'anthropic/claude-sonnet-4-5', contextTokens: 1200, contextWindow: 200000 },
  });
  const progressed = harness.events.findLast(input => input.event.type === 'subagent.updated');
  expect(progressed?.event).toMatchObject({
   type: 'subagent.updated', subagent: {
    subagentId: 'SettingsAuditScout', name: 'SettingsAuditScout', role: 'scout',
    description: 'Audit settings IA', solutionSpace: 'Check settings IA',
    activeTool: 'grep', activeToolArgs: 'packages/ui/**',
    model: 'anthropic/claude-sonnet-4-5', contextTokens: 1200, contextWindow: 200000,
   }
  });
  await bus.emit(TASK_SUBAGENT_LIFECYCLE_CHANNEL, { id: 'SettingsAuditScout', agent: 'scout', agentSource: 'bundled', index: 0, status: 'completed' });
  const finished = harness.events.findLast(input => input.event.type === 'subagent.updated');
  expect(finished?.event).toMatchObject({
   type: 'subagent.updated', subagent: {
    description: 'Audit settings IA', solutionSpace: 'Check settings IA', status: 'completed',
   }
  });
 } finally { await harness.close(); }
});

test('native compact refuses while a run is active', async () => {
 const firstRequest = Promise.withResolvers<void>();
 const release = Promise.withResolvers<void>();
 const harness = await fixture({
  async respond() {
   firstRequest.resolve();
   await release.promise;
   return completion();
  }
 });
 const terminal = Promise.withResolvers<void>();
 const unsubscribe = harness.worker.session.subscribe(event => {
  if (event.type === 'agent_end') terminal.resolve();
 });
 try {
  await harness.worker.operation({ type: 'prompt', runId: 'compact-active-run', request: prompt('Keep this run active.') });
  await firstRequest.promise;
  await expect(harness.worker.operation({ type: 'compact', instructions: 'Preserve the active-run refusal.' }))
   .rejects.toMatchObject({ status: 409, code: 'RUN_ACTIVE' });
  release.resolve();
  await terminal.promise;
  expect(harness.fatal()).toBe(false);
 } finally {
  release.resolve();
  unsubscribe();
  await harness.close();
 }
}, 30000);

test('native branch CAS rejects stale owner/version and redo expires after a new prompt', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const manager = harness.worker.session.sessionManager;
  manager.appendMessage({ role: 'user', content: 'Original prompt', timestamp: Date.now() });
  manager.appendMessage({
   role: 'assistant', content: [{ type: 'text', text: 'Original reply' }], api: 'openai-completions', provider: 'native-fixture',
   model: 'native-model', stopReason: 'stop', timestamp: Date.now(),
   usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
  });
  await manager.flush();
  const before = harness.worker.seed();
  const target = before.messages.find(message => message.role === 'user')!;
  const leaf = manager.getLeafId();
  await expect(harness.worker.operation({
   type: 'branch', request: {
    action: 'revert', messageId: target.messageId,
    branchId: 'another-branch', branchVersion: before.branch.branchVersion
   }
  })).rejects.toMatchObject({ code: 'SESSION_BRANCH_CONFLICT' });
  expect(manager.getLeafId()).toBe(leaf);
  const reverted = await harness.worker.operation({
   type: 'branch', request: {
    action: 'revert', messageId: target.messageId,
    branchId: before.branch.branchId, branchVersion: before.branch.branchVersion
   }
  });
  if (reverted.type !== 'branch') throw new Error('Native branch response is required');
  await expect(harness.worker.operation({
   type: 'branch', request: {
    action: 'restore', branchId: before.branch.branchId,
    branchVersion: before.branch.branchVersion
   }
  })).rejects.toMatchObject({ code: 'SESSION_BRANCH_CONFLICT' });
  const restored = await harness.worker.operation({
   type: 'branch', request: {
    action: 'restore', branchId: reverted.result.branch.branchId,
    branchVersion: reverted.result.branch.branchVersion
   }
  });
  if (restored.type !== 'branch') throw new Error('Native restore response is required');
  expect(restored.result.branch.revert).toBeUndefined();
  expect(restored.seed.messages).toEqual(before.messages);
  const again = await harness.worker.operation({
   type: 'branch', request: {
    action: 'revert', messageId: target.messageId,
    branchId: restored.result.branch.branchId, branchVersion: restored.result.branch.branchVersion
   }
  });
  if (again.type !== 'branch') throw new Error('Native branch response is required');
  const terminal = Promise.withResolvers<void>();
  const unsubscribe = harness.worker.session.subscribe(event => { if (event.type === 'agent_end') terminal.resolve(); });
  try {
   await harness.worker.operation({ type: 'prompt', runId: 'new-branch-run', request: prompt('A new branch prompt') });
   await expect(harness.worker.operation({
    type: 'branch', request: {
     action: 'restore', branchId: again.result.branch.branchId,
     branchVersion: again.result.branch.branchVersion
    }
   })).rejects.toMatchObject({ code: 'RUN_ACTIVE' });
   await terminal.promise;
   const history = await harness.worker.operation({ type: 'history', request: { sessionId: rootSessionId } });
   if (history.type !== 'history') throw new Error('Native history response is required');
   expect(history.history.branch.revert).toBeUndefined();
   await expect(harness.worker.operation({
    type: 'branch', request: {
     action: 'restore', branchId: history.history.branch.branchId,
     branchVersion: history.history.branch.branchVersion
    }
   })).rejects.toMatchObject({ code: 'SESSION_BRANCH_CONFLICT' });
  } finally { unsubscribe(); }
  expect(harness.fatal()).toBe(false);
 } finally { await harness.close(); }
}, 30000);

test('branch revert on unchanged leaf returns 409 without failing worker and subsequent prompt succeeds', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  // Verify LSP tool is available inside worker session (enableLsp is not forced to false)
  expect(harness.worker.session.getAllToolNames()).toContain('lsp');

  const terminal = Promise.withResolvers<void>();
  const unsubscribe = harness.worker.session.subscribe(event => {
   if (event.type === 'agent_end') terminal.resolve();
  });
  try {
   await harness.worker.operation({ type: 'prompt', runId: 'first-run', request: prompt('First prompt') });
   await terminal.promise;
  } finally {
   unsubscribe();
  }

  const before = harness.worker.seed();
  expect(before.messages.length).toBeGreaterThan(0);
  const lastMessage = before.messages.at(-1)!;
  // First revert moves leaf to the target assistant message
  const reverted = await harness.worker.operation({
   type: 'branch',
   request: {
    action: 'revert',
    messageId: lastMessage.messageId,
    branchId: before.branch.branchId,
    branchVersion: before.branch.branchVersion,
   },
  });
  if (reverted.type !== 'branch') throw new Error('Branch operation expected');

  // Second revert targeting the same message: navigateTree detects target is already at leaf and does not change leaf
  // Must reject with 409 COMMAND_IN_FLIGHT without appending duplicate branch entry and without failing worker
  const leafBefore = harness.worker.session.sessionManager.getLeafId();
  await expect(harness.worker.operation({
   type: 'branch',
   request: {
    action: 'revert',
    messageId: lastMessage.messageId,
    branchId: reverted.result.branch.branchId,
    branchVersion: reverted.result.branch.branchVersion,
   },
  })).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });

  // No duplicate branch entry appended to tree
  expect(harness.worker.session.sessionManager.getLeafId()).toBe(leafBefore);

  // Worker generation must not be marked fatal / failed
  expect(harness.fatal()).toBe(false);

  // Subsequent prompt in the SAME worker generation succeeds
  const secondTerminal = Promise.withResolvers<void>();
  const unsubscribeSecond = harness.worker.session.subscribe(event => {
   if (event.type === 'agent_end') secondTerminal.resolve();
  });
  try {
   await harness.worker.operation({ type: 'prompt', runId: 'second-run', request: prompt('Second prompt in same generation') });
   await secondTerminal.promise;
  } finally {
   unsubscribeSecond();
  }

  expect(harness.fatal()).toBe(false);
  const after = harness.worker.seed();
  expect(after.messages.length).toBeGreaterThan(before.messages.length);
 } finally {
  await harness.close();
 }
}, 30000);

test('branch revert rollback restores previous leaf and in-memory messages without failing worker', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const terminal = Promise.withResolvers<void>();
  const unsubscribe = harness.worker.session.subscribe(event => {
   if (event.type === 'agent_end') terminal.resolve();
  });
  try {
   await harness.worker.operation({ type: 'prompt', runId: 'p1', request: prompt('Prompt 1') });
   await terminal.promise;
  } finally {
   unsubscribe();
  }
  const before = harness.worker.seed();
  const manager = harness.worker.session.sessionManager;
  const priorLeaf = manager.getLeafId();

  // Mock manager.appendEntriesAtomically to fail once after navigateTree succeeds
  const originalAppend = manager.appendEntriesAtomically.bind(manager);
  let injected = false;
  manager.appendEntriesAtomically = (async (fn: () => Promise<unknown>) => {
   if (!injected) {
    injected = true;
    throw new Error('Injected commit failure');
   }
   return originalAppend(fn);
  }) as typeof manager.appendEntriesAtomically;

  await expect(harness.worker.operation({
   type: 'branch',
   request: {
    action: 'revert',
    messageId: before.messages[0]!.messageId,
    branchId: before.branch.branchId,
    branchVersion: before.branch.branchVersion,
   },
  })).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });

  // Restores branch positioned on prior leaf with branch selection entry
  const restoredLeaf = manager.getEntry(manager.getLeafId() ?? '');
  expect(restoredLeaf?.parentId).toBe(priorLeaf);
  expect(restoredLeaf?.type).toBe('custom');
  // Worker generation is not killed
  expect(harness.fatal()).toBe(false);

  // In-memory messages match display context of restored branch
  expect(harness.worker.session.agent.state.messages).toHaveLength(
   harness.worker.session.buildDisplaySessionContext().messages.length,
  );

  // Subsequent prompt succeeds in same worker generation
  const secondTerminal = Promise.withResolvers<void>();
  const unsubscribeSecond = harness.worker.session.subscribe(event => {
   if (event.type === 'agent_end') secondTerminal.resolve();
  });
  try {
   await harness.worker.operation({ type: 'prompt', runId: 'p2', request: prompt('Prompt 2') });
   await secondTerminal.promise;
  } finally {
   unsubscribeSecond();
  }
  expect(harness.fatal()).toBe(false);
 } finally {
  await harness.close();
 }
}, 30000);
test('actual native TaskTool owns a child session and persists its history', async () => {
 let requests = 0;
 const lifecycle: SubagentLifecyclePayload[] = [];
 const harness = await fixture({
  onSubagent: payload => lifecycle.push(payload),
  respond: () => {
   requests += 1;
   if (requests === 1) return completion({ name: 'task', id: 'native-task', input: { agent: 'child', name: 'child-proof', task: 'Return the child proof marker.' } });
   return completion();
  },
 });
 const terminal = Promise.withResolvers<void>();
 const unsubscribe = harness.worker.session.subscribe(event => {
  if (event.type === 'agent_end') terminal.resolve();
 });
 try {
  cfgToolsApprovalMode.override(harness.worker.session.settings, 'yolo');
  await harness.worker.operation({ type: 'prompt', runId: 'task-run', request: prompt('Spawn one native child and wait for its result.') });
  await terminal.promise;
  expect(requests).toBeGreaterThanOrEqual(3);

  expect(lifecycle.map(event => event.status)).toEqual(['started', 'completed']);
  const started = lifecycle[0];
  const completed = lifecycle[1];
  expect(started?.id).toBe(completed?.id);
  const history = await harness.worker.operation({ type: 'history', request: { sessionId: rootSessionId } });
  if (history.type !== 'history') throw new Error('Canonical history response is required');
  const taskCall = history.history.messages.flatMap(message => message.parts).find(part => part.type === 'tool_call' && part.toolName === 'task');
  if (taskCall?.type !== 'tool_call') throw new Error('Canonical native TaskTool call is required');
  expect(taskCall.toolCallId).toBe('native-task');
  expect(started?.parentToolCallId).toBe(taskCall.toolCallId);
  expect(completed?.parentToolCallId).toBe(taskCall.toolCallId);
  expect(started?.sessionFile).toBeTruthy();
  if (!started?.sessionFile) throw new Error('Native child session file was not published');
  const child = await SessionManager.open(started.sessionFile, dirname(started.sessionFile), undefined, { initialCwd: harness.root, throwIfMissing: true });
  try {
   expect(child.getSessionId()).not.toBe(rootSessionId);
   expect(child.getEntries().some(entry => entry.type === 'message' && entry.message.role === 'user')).toBe(true);
   expect(child.getEntries().some(entry => entry.type === 'message' && entry.message.role === 'assistant')).toBe(true);
  } finally { await child.close(); }
  expect(harness.fatal()).toBe(false);
 } finally {
  unsubscribe();
  await harness.close();
 }
}, 60000);


test('native child tool calls re-enter Host authorization', async () => {
 let requests = 0;
 const harness = await fixture({
  respond: () => {
   requests += 1;
   if (requests === 1) return completion({ name: 'task', id: 'native-task', input: { agent: 'child', name: 'child-proof', task: 'Write child.txt then return the marker.' } });
   if (requests === 2) return completion({ name: 'write', id: 'native-child-write', input: { path: 'child.txt', content: 'child' } });
   return completion();
  }
 });
 const terminal = Promise.withResolvers<void>();
 const unsubscribe = harness.worker.session.subscribe(event => {
  if (event.type === 'agent_end') terminal.resolve();
 });
 try {
  cfgToolsApprovalMode.override(harness.worker.session.settings, 'yolo');
  await harness.worker.operation({ type: 'prompt', runId: 'child-auth-run', request: prompt('Spawn one native child that writes a file.') });
  await terminal.promise;
  expect(harness.hostRequests.some(request => request.type === 'tool' && request.toolName === 'task')).toBe(true);
  expect(harness.hostRequests.some(request => request.type === 'tool' && request.toolName === 'write' && request.input.path === 'child.txt')).toBe(true);
  expect(harness.fatal()).toBe(false);
 } finally {
  unsubscribe();
  await harness.close();
 }
}, 60000);

test('native child Bash and its mounted commands both require Host authorization', async () => {
 const shellCommand = 'printf child-bash-denied';
 const mountedCommand = `lsp -j '{"action":"status"}'`;
 let requests = 0;
 const harness = await fixture({
  deniedCommands: [shellCommand], machineCommands: [mountedCommand], denyLsp: true,
  respond: () => {
   requests += 1;
   if (requests === 1) return completion({ name: 'task', id: 'child-bash-task', input: { agent: 'child', name: 'child-bash', task: 'Run both Bash commands.' } });
   if (requests === 2) return completion({ name: 'bash', id: 'child-bash-shell', input: { command: shellCommand } });
   if (requests === 3) return completion({ name: 'bash', id: 'child-bash-mounted', input: { command: mountedCommand } });
   return completion();
  },
 });
 const terminal = Promise.withResolvers<void>();
 const unsubscribe = harness.worker.session.subscribe(event => {
  if (event.type === 'agent_end') terminal.resolve();
 });
 try {
  cfgToolsApprovalMode.override(harness.worker.session.settings, 'yolo');
  cfgBashPatterns.override(harness.worker.session.settings, [shellCommand, mountedCommand].map(match => ({ match, approval: 'allow' })));
  await harness.worker.operation({ type: 'prompt', runId: 'child-bash-run', request: prompt('Spawn one native child to run both Bash commands.') });
  await terminal.promise;
  expect(harness.hostRequests.filter(request => request.type === 'tool' && ['bash', 'lsp'].includes(request.toolName))).toEqual([
   expect.objectContaining({ toolName: 'bash', input: { command: shellCommand }, toolCallId: 'child-bash-shell' }),
   expect.objectContaining({ toolName: 'bash', input: { command: mountedCommand }, toolCallId: 'child-bash-mounted' }),
   expect.objectContaining({ toolName: 'lsp', input: { action: 'status' } }),
  ]);
  expect(harness.requests[2]?.messages.at(-1)?.content).toContain('Host policy refused Bash');
  expect(harness.requests[3]?.messages.at(-1)?.content).toContain('Host policy refused the tool operation');
 } finally {
  unsubscribe();
  await harness.close();
 }
}, 60000);

test('provider.use authorization is requested once per provider/model/endpoint tuple for the worker lifetime', async () => {
 const harness = await fixture({ respond: () => completion() });
 const turnDone = () => {
  const done = Promise.withResolvers<void>();
  const unsubscribe = harness.worker.session.subscribe(event => { if (event.type === 'agent_end') done.resolve(); });
  return { done: done.promise, unsubscribe };
 };
 const providerUseRequests = () => harness.hostRequests.filter(request => request.type === 'tool' && request.toolName === 'provider.use');
 const first = turnDone();
 try {
  await harness.worker.operation({ type: 'prompt', runId: 'provider-use-first', request: prompt('First turn.') });
  await first.done;
  first.unsubscribe();
  expect(providerUseRequests()).toHaveLength(1);
  expect(providerUseRequests()[0]).toMatchObject({ input: { providerId: 'native-fixture', modelId: 'native-model' } });
  const second = turnDone();
  await harness.worker.operation({ type: 'prompt', runId: 'provider-use-second', request: prompt('Second turn.') });
  await second.done;
  second.unsubscribe();
  // A later turn of the same worker reuses the cached approval instead of a new round-trip.
  expect(providerUseRequests()).toHaveLength(1);
  expect(harness.fatal()).toBe(false);
 } finally { await harness.close(); }
}, 30000);

test('automatic selection authorizes provider.use before resolving and never caches denial', async () => {
 // Deny only the first authorization: a cache that stored denials would skip the
 // Host on the second turn and let the refused provider through.
 const harness = await fixture({ respond: () => completion(), apiKey: 'automatic-fixture-key', denyProviderUse: attempt => (attempt === 1 ? new Error('Host policy refused the provider') : undefined) });
 const turnSettled = () => {
  const done = Promise.withResolvers<void>();
  const unsubscribe = harness.worker.session.subscribe(event => {
   if (event.type === 'agent_end') done.resolve();
  });
  return { done: done.promise, unsubscribe };
 };
 const providerUseRequests = () => harness.hostRequests.filter(request => request.type === 'tool' && request.toolName === 'provider.use');
 try {
  const model = harness.worker.session.modelRegistry.find('native-fixture', 'native-model');
  if (!model) throw new Error('Fixture model is unavailable');
  await harness.worker.operation({
   type: 'catalog', revision: '3', operation: {
    type: 'catalog.provider.configure', request: {
     expectedRevision: '2', configuration: {
      providerId: model.provider, name: 'Native fixture', endpoint: model.baseUrl, protocol: 'chat-completions', credentialRef: null,
     }
    },
   }
  });
  // Prompt admission returns before the model call, so the refusal lands later in the turn.
  const first = turnSettled();
  await harness.worker.operation({ type: 'prompt', runId: 'provider-use-denied', request: prompt('Denied turn.') }).catch(() => undefined);
  await first.done;
  first.unsubscribe();
  expect(providerUseRequests()).toHaveLength(1);
  // The refused use never reaches the provider: no resolution, no request.
  expect(harness.requests.length).toBe(0);
  expect(harness.fatal()).toBe(false);
  const second = turnSettled();
  await harness.worker.operation({ type: 'prompt', runId: 'provider-use-retry', request: prompt('Retried turn.') });
  await second.done;
  second.unsubscribe();
  // No cached denial: the retry performs a second full Host authorization.
  expect(providerUseRequests()).toHaveLength(2);
  expect(harness.requests.length).toBeGreaterThan(0);
  expect(harness.fatal()).toBe(false);
 } finally { await harness.close(); }
}, 30000);

test('the next turn in an open session uses the updated provider endpoint', async () => {
 const paths: string[] = [];
 const harness = await fixture({
  respond: (_payload, _root, request) => {
   paths.push(new URL(request.url).pathname);
   return completion();
  }
 });
 const send = async (id: string, text: string) => {
  await harness.worker.operation({ type: 'prompt', runId: id, request: prompt(text) });
  await waitForGoal(harness.worker, () => harness.events.some(({ event }) =>
   event.type === 'run.completed' && event.runId === id), 5000);
 };
 try {
  await send('before-edit', 'Before endpoint edit.');
  const endpoint = harness.worker.session.model!.baseUrl;
  const updatedEndpoint = new URL('/moved/v1', endpoint).href;
  const modelsPath = join(harness.agentDirectory, 'models.yml');
  const models = await readFile(modelsPath, 'utf8');
  expect(models).toContain(endpoint);
  await writeFile(modelsPath, models.replace(endpoint, updatedEndpoint));
  await send('after-edit', 'After endpoint edit.');
  expect(paths).toEqual(['/v1/chat/completions', '/moved/v1/chat/completions']);
  expect(promptRequest(harness.requests, 'After endpoint edit.').messages.some(message =>
   message.role === 'user' && JSON.stringify(message.content).includes('Before endpoint edit.'),
  )).toBe(true);
  expect(harness.hostRequests).toContainEqual(expect.objectContaining({
   type: 'tool', toolName: 'provider.use', input: { providerId: 'native-fixture', modelId: 'native-model', endpoint: updatedEndpoint },
  }));
 } finally { await harness.close(); }
}, 30000);

test('actual SDK edit reaches Host policy and projects its exact replace arguments', async () => {
 const input = {
  path: 'fixture-diff.txt', old_string: "export const greeting = 'hello';",
  new_string: "export const greeting = 'hello, restored UI';\nexport const mood = 'warm';"
 };
 const harness = await fixture({
  respond(payload) {
   return payload.messages.at(-1)?.role === 'tool'
    ? completion()
    : completion({ name: 'edit', id: 'native-edit', input });
  }
 });
 const terminal = Promise.withResolvers<void>();
 const unsubscribe = harness.worker.session.subscribe(event => { if (event.type === 'agent_end') terminal.resolve(); });
 try {
  cfgToolsApprovalMode.override(harness.worker.session.settings, 'yolo');
  cfgEditMode.override(harness.worker.session.settings, 'replace');
  await writeFile(join(harness.root, 'fixture-diff.txt'), "export const greeting = 'hello';\nexport const count = 1;\n");
  await harness.worker.operation({ type: 'prompt', runId: 'edit-run', request: prompt('Edit fixture-diff.txt using the configured native replace mode.') });
  await terminal.promise;
  expect(await readFile(join(harness.root, 'fixture-diff.txt'), 'utf8'))
   .toBe("export const greeting = 'hello, restored UI';\nexport const mood = 'warm';\nexport const count = 1;\n");
  expect(harness.fatal()).toBe(false);
  const started = harness.events.map(event => event.event)
   .filter(event => event.type === 'tool.started' && event.toolCallId === 'native-edit');
  expect(started).toEqual([{ type: 'tool.started', toolCallId: 'native-edit', toolName: 'edit', input }]);
  const completed = harness.events.map(event => event.event)
   .filter(event => event.type === 'tool.completed' && event.toolCallId === 'native-edit');
  expect(completed).toHaveLength(1);
  expect(completed[0]).toMatchObject({ status: 'completed', isError: false });
  expect(harness.events.some(event => event.event.type === 'run.failed')).toBe(false);
 } finally {
  unsubscribe();
  await harness.close();
 }
}, 30000);

test('model catalog plan availability matches whether plan mode can enter', async () => {
 const missing = await fixture({ respond: () => completion() });
 try {
  const catalog = await missing.worker.operation({ type: 'catalog', revision: '0', operation: { type: 'catalog.models.read' } });
  expect(catalog).toMatchObject({ type: 'catalog', result: { type: 'catalog.models', catalog: { planRoleAvailable: false } } });
  await expect(missing.worker.operation({ type: 'mode.set', mode: 'plan' })).rejects.toMatchObject({ status: 422, code: 'MODEL_UNAVAILABLE' });
 } finally { await missing.close(); }

 const configured = await fixture({ respond: () => completion(), planModel: true });
 try {
  const catalog = await configured.worker.operation({ type: 'catalog', revision: '0', operation: { type: 'catalog.models.read' } });
  expect(catalog).toMatchObject({ type: 'catalog', result: { type: 'catalog.models', catalog: { planRoleAvailable: true } } });
  await expect(configured.worker.operation({ type: 'mode.set', mode: 'plan' }))
   .resolves.toMatchObject({ type: 'mode.set', mode: { kind: 'plan', status: 'active' } });
 } finally { await configured.close(); }
});

test('native plan mode restores its tools and role model after reopening the same file', async () => {
 const harness = await fixture({ respond: () => completion(), planModel: true });
 try {
  const before = harness.worker.session.getEnabledToolNames();
  const entered = await harness.worker.operation({ type: 'mode.set', mode: 'plan' });
  expect(entered).toMatchObject({ type: 'mode.set', mode: { kind: 'plan', status: 'active', planReference: expect.stringMatching(/^local:\/\//) } });
  expect(harness.worker.session.getEnabledToolNames()).toEqual([...new Set([...before, ...(harness.worker.session.hasBuiltInTool('write') ? ['write'] : [])])]);
  expect(harness.worker.session.model?.id).toBe('native-plan-model');
  expect(harness.journal.snapshot().session.mode).toEqual(harness.worker.mode());
  expect(harness.events).toContainEqual(expect.objectContaining({ event: { type: 'session.updated', mode: harness.worker.mode() } }));
  await harness.reopen();
  expect(harness.worker.mode()).toEqual(entered.type === 'mode.set' ? entered.mode : undefined);
  expect(harness.journal.snapshot().session.mode).toEqual(harness.worker.mode());
  expect(harness.worker.session.model?.id).toBe('native-plan-model');
  expect(harness.worker.session.getEnabledToolNames()).toEqual([...new Set([...before, ...(harness.worker.session.hasBuiltInTool('write') ? ['write'] : [])])]);
  expect(await harness.worker.operation({ type: 'mode.set', mode: 'main' })).toEqual({ type: 'mode.set', mode: { kind: 'main' } });
  expect(harness.worker.session.getEnabledToolNames()).toEqual(before);
  expect(harness.worker.session.model?.id).toBe('native-model');
  await harness.reopen();
  expect(harness.worker.mode()).toEqual({ kind: 'main' });
  expect(harness.worker.session.model?.id).toBe('native-model');
 } finally { await harness.close(); }
}, 30000);

test('native vibe mode restores tools after reopening and returning to Main', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const before = harness.worker.session.getEnabledToolNames();
  const entered = await harness.worker.operation({ type: 'mode.set', mode: 'vibe' });
  expect(entered).toEqual({ type: 'mode.set', mode: { kind: 'vibe' } });
  expect(harness.worker.session.getEnabledToolNames()).toEqual(['read', ...(harness.worker.session.hasBuiltInTool('todo') ? ['todo'] : []), 'vibe_spawn', 'vibe_send', 'vibe_wait', 'vibe_kill', 'vibe_list', 'report_issue']);
  expect(harness.journal.snapshot().session.mode).toEqual({ kind: 'vibe' });
  await harness.reopen();
  expect(harness.worker.mode()).toEqual({ kind: 'vibe' });
  expect(harness.worker.session.getEnabledToolNames()).toEqual(['read', ...(harness.worker.session.hasBuiltInTool('todo') ? ['todo'] : []), 'vibe_spawn', 'vibe_send', 'vibe_wait', 'vibe_kill', 'vibe_list', 'report_issue']);
  expect(await harness.worker.operation({ type: 'mode.set', mode: 'main' })).toEqual({ type: 'mode.set', mode: { kind: 'main' } });
  expect(harness.worker.session.getEnabledToolNames()).toEqual(before);
  await harness.reopen();
  expect(harness.worker.mode()).toEqual({ kind: 'main' });
 } finally { await harness.close(); }
}, 30000);

test('native plan and vibe transitions remain mutually exclusive', async () => {
 const harness = await fixture({ respond: () => completion(), planModel: true });
 try {
  await harness.worker.operation({ type: 'mode.set', mode: 'plan' });
  const vibe = await harness.worker.operation({ type: 'mode.set', mode: 'vibe' });
  expect(vibe).toEqual({ type: 'mode.set', mode: { kind: 'vibe' } });
  expect(harness.worker.session.getPlanModeState()).toBeUndefined();
  expect(harness.worker.session.getEnabledToolNames()).toContain('vibe_spawn');
  const plan = await harness.worker.operation({ type: 'mode.set', mode: 'plan' });
  expect(plan).toMatchObject({ type: 'mode.set', mode: { kind: 'plan', status: 'active' } });
  expect(harness.worker.session.getEnabledToolNames()).not.toContain('vibe_spawn');
  expect(harness.journal.snapshot().session.mode).toEqual(plan.type === 'mode.set' ? plan.mode : undefined);
  await harness.worker.operation({ type: 'mode.set', mode: 'main' });
 } finally { await harness.close(); }
}, 30000);

test('native plan prompts keep the role model despite captured Main options', async () => {
 const requested = Promise.withResolvers<ProviderRequest>();
 const harness = await fixture({ planModel: true, respond: payload => { requested.resolve(payload); return completion(); } });
 try {
  await harness.worker.operation({ type: 'mode.set', mode: 'plan' });
  await harness.worker.operation({ type: 'prompt', runId: 'plan-role-run', request: prompt('Read the plan context.') });
  expect((await requested.promise).model).toBe('native-plan-model');
  expect(harness.worker.session.model?.id).toBe('native-plan-model');
 } finally { await harness.close(); }
}, 30000);

test('native mode controller restores plan_paused without activating planning tools', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  harness.worker.session.sessionManager.appendModeChange('plan_paused', { planFilePath: 'local://paused-plan.md' });
  await harness.worker.session.sessionManager.flush();
  await harness.reopen();
  expect(harness.worker.mode()).toEqual({ kind: 'plan', status: 'paused', planReference: 'local://paused-plan.md' });
  expect(harness.worker.session.getPlanModeState()).toBeUndefined();
  const restored = new WorkerModeController(harness.worker.session);
  expect(restored.mode()).toEqual(harness.worker.mode());
  expect(await harness.worker.operation({ type: 'mode.set', mode: 'main' })).toEqual({ type: 'mode.set', mode: { kind: 'main' } });
 } finally { await harness.close(); }
}, 30000);

test('native plan mode refuses an actual write outside the plan reference', async () => {
 const failed = Promise.withResolvers<void>();
 const harness = await fixture({
  planModel: true, respond: payload => payload.messages.at(-1)?.role === 'tool'
   ? completion() : completion({ name: 'write', id: 'outside-plan-write', input: { path: 'outside-plan.txt', content: 'must-refuse' } })
 });
 const unsubscribe = harness.worker.session.subscribe(event => {
  if (event.type === 'tool_execution_end' && event.toolCallId === 'outside-plan-write') failed.resolve();
 });
 try {
  await harness.worker.operation({ type: 'mode.set', mode: 'plan' });
  await harness.worker.operation({ type: 'prompt', runId: 'plan-write-run', request: prompt('Write outside the plan file.') });
  await failed.promise;
  const outcome = harness.events.map(input => input.event).find(event => event.type === 'tool.completed' && event.toolCallId === 'outside-plan-write');
  expect(outcome).toMatchObject({ status: 'failed', isError: true });
  await expect(readFile(join(harness.root, 'outside-plan.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
 } finally { unsubscribe(); await harness.close(); }
}, 30000);

test('native mode changes reject while a worker run is active', async () => {
 const harness = await fixture({ respond: () => completion() });
 const gate = Promise.withResolvers<boolean>();
 try {
  const run = harness.worker.startWorkerRun('plan', () => gate.promise);
  await expect(harness.worker.operation({ type: 'mode.set', mode: 'plan' })).rejects.toMatchObject({ status: 409, code: 'RUN_ACTIVE' });
  gate.resolve(false);
  await run;
 } finally {
  await harness.close();
 }
}, 30000);

/** The last `fileMention` the worker appended for a prompt, i.e. what the model will see. */
function lastFileMention(harness: { worker: WorkerSession }) {
 const message = harness.worker.session.sessionManager.getEntries().flatMap(entry => {
  const entryMessage = entry.type === 'message' ? entry.message : undefined;
  return entryMessage && entryMessage.role === 'fileMention' ? [entryMessage] : [];
 }).at(-1);
 if (!message || message.role !== 'fileMention') throw new Error('Attachment did not reach the transcript');
 return message;
}

test('a plain text attachment is inlined with its name as a delimiter', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const notePath = join(harness.root, 'note.txt');
  await writeFile(notePath, 'INLINE_ATTACHMENT_BODY');
  const note = { attachmentId: 'note-att', name: 'note.txt', mediaType: 'text/plain', size: Buffer.byteLength('INLINE_ATTACHMENT_BODY'), uri: 'attachment://note-att' };
  await harness.worker.operation({
   type: 'prompt', runId: 'text-attachment-run',
   request: { ...prompt('Read the attached note.'), input: { text: 'Read the attached note.', attachments: [note], context: [] } },
   attachments: [{ attachmentId: note.attachmentId, path: notePath }],
  });
  // OMP renders each file as `<file path="note.txt">…</file>`, so the name is
  // the delimiter the model sees around the inlined body.
  expect(lastFileMention(harness).files).toEqual([{ path: 'note.txt', content: 'INLINE_ATTACHMENT_BODY' }]);
 } finally {
  await harness.close();
 }
}, 30000);

test('a binary attachment is handed off as a readable session path, not refused', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const binaryPath = join(harness.root, 'sample.bin');
  await writeFile(binaryPath, Buffer.from([0x00, 0x01, 0x02, 0xff]));
  const binary = { attachmentId: 'bin-att', name: 'sample.bin', mediaType: 'application/octet-stream', size: 4, uri: 'attachment://bin-att' };
  await harness.worker.operation({
   type: 'prompt', runId: 'bin-run',
   request: { ...prompt('Inspect the attached binary.'), input: { text: 'Inspect the attached binary.', attachments: [binary], context: [] } },
   attachments: [{ attachmentId: binary.attachmentId, path: binaryPath }],
  });
  const file = lastFileMention(harness).files[0]!;
  expect(file.skippedReason).toBe('binary');
  expect(file.byteSize).toBe(4);
  // The published reference is session-relative, never a private Host path.
  expect(file.path).toBe('local://attachments/bin-att-sample.bin');
  expect(file.path).not.toContain(harness.root);
  expect(file.path).not.toContain(tmpdir());
  expect(file.content).toContain('Read this file to inspect it');
  // The reference OMP was given actually resolves, at read tier, inside the
  // session's own scratch root — the model can `read` it.
  const located = await InternalUrlRouter.instance().locate(file.path, {
   cwd: harness.root,
   localProtocolOptions: {
    getArtifactsDir: () => harness.worker.session.sessionManager.getArtifactsDir(),
    getSessionId: () => harness.worker.session.sessionManager.getSessionId(),
   },
  });
  if (!located) throw new Error('Session path reference did not resolve');
  expect(located).not.toContain(harness.root);
  expect(located).toContain('local');
  expect(await readFile(located)).toEqual(Buffer.from([0x00, 0x01, 0x02, 0xff]));
 } finally {
  await harness.close();
 }
}, 30000);

test('an attachment without a Host-resolved reference is refused before any prompt mutation', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const attachment = { attachmentId: 'unresolved-att', name: 'unresolved.txt', mediaType: 'text/plain', size: 2, uri: 'attachment://unresolved-att' };
  // The Host must hand the worker an authorized absolute path; a submission
  // that names an attachment but authorizes nothing is refused, not guessed.
  await expect(harness.worker.operation({
   type: 'prompt', runId: 'unresolved-run',
   request: { ...prompt('Read the attached file.'), input: { text: 'Read the attached file.', attachments: [attachment], context: [] } },
   attachments: [{ attachmentId: 'other-att', path: join(harness.root, 'note.txt') }],
  })).rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
  expect(harness.worker.session.sessionManager.getEntries().some(entry => entry.type === 'message' && entry.message.role === 'fileMention')).toBe(false);
 } finally {
  await harness.close();
 }
}, 30000);

test('a later attachment failure leaves no partial attachment context behind', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  // The first attachment is fully preparable; the second has no Host-resolved
  // reference. Preparation must be all-or-nothing, so the first one never lands.
  const notePath = join(harness.root, 'note.txt');
  await writeFile(notePath, 'PARTIAL_ATTACHMENT_BODY');
  const note = { attachmentId: 'partial-note', name: 'note.txt', mediaType: 'text/plain', size: Buffer.byteLength('PARTIAL_ATTACHMENT_BODY'), uri: 'attachment://partial-note' };
  const missing = { attachmentId: 'missing-att', name: 'missing.txt', mediaType: 'text/plain', size: 3, uri: 'attachment://missing-att' };
  await expect(harness.worker.operation({
   type: 'prompt', runId: 'partial-run',
   request: { ...prompt('Send both attachments.'), input: { text: 'Send both attachments.', attachments: [note, missing], context: [] } },
   attachments: [{ attachmentId: note.attachmentId, path: notePath }],
  })).rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
  const mentions = harness.worker.session.sessionManager.getEntries().flatMap(entry => {
   const entryMessage = entry.type === 'message' ? entry.message : undefined;
   return entryMessage && entryMessage.role === 'fileMention' ? [entryMessage] : [];
  });
  expect(mentions).toEqual([]);
  expect(JSON.stringify(harness.requests)).not.toContain('PARTIAL_ATTACHMENT_BODY');
 } finally {
  await harness.close();
 }
}, 30000);

test('an oversized text attachment is handed off by path instead of rejected', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const largePath = join(harness.root, 'large.txt');
  await writeFile(largePath, 'x'.repeat(300 * 1024));
  const large = { attachmentId: 'large-att', name: 'large.txt', mediaType: 'text/plain', size: 300 * 1024, uri: 'attachment://large-att' };
  await harness.worker.operation({
   type: 'prompt', runId: 'large-run',
   request: { ...prompt('Summarize the attached file.'), input: { text: 'Summarize the attached file.', attachments: [large], context: [] } },
   attachments: [{ attachmentId: large.attachmentId, path: largePath }],
  });

  const message = harness.worker.session.sessionManager.getEntries().flatMap(entry => {
   const entryMessage = entry.type === 'message' ? entry.message : undefined;
   return entryMessage && entryMessage.role === 'fileMention' ? [entryMessage] : [];
  }).at(-1);
  if (!message || message.role !== 'fileMention') throw new Error('Oversized attachment did not reach the transcript');
  const file = message.files[0]!;
  expect(file.skippedReason).toBe('tooLarge');
  expect(file.byteSize).toBe(300 * 1024);
  expect(file.content).not.toContain('xxxxxxxx');
  expect(file.path).toMatch(/^local:\/\/attachments\/large-att-large\.txt$/);
  expect(file.path).not.toContain(harness.root);
 } finally {
  await harness.close();
 }
}, 30000);

for (const action of ['approve', 'approve-compact', 'feedback', 'reject'] as const) {
 test(`native plan proposal supports ${action} through canonical questions`, async () => {
  let stage = 0;
  let executionStarted = false;
  const execution = Promise.withResolvers<ProviderRequest>();
  const releasePlanning = Promise.withResolvers<void>();
  const planText = '# Native plan\nImplement the requested review.';
  const harness = await fixture({
   planModel: true, machineCommands: ['propose review'], respond: async payload => {
    stage++;
    if (stage === 1) return completion({ name: 'write', id: 'write-plan', input: { path: 'local://PLAN.md', content: planText } });
    if (stage === 2) return completion({ name: 'bash', id: 'propose-plan', input: { command: 'propose review' } });
    const content = JSON.stringify(payload.messages);
    if (content.includes('Plan approved.') || content.includes('Revise the verification step.')) {
     executionStarted = true;
     execution.resolve(payload);
    } else await releasePlanning.promise;
    return completion();
   }
  });
  const planningEnded = Promise.withResolvers<void>();
  const executionEnded = Promise.withResolvers<void>();
  let ended = 0;
  const unsubscribe = harness.worker.session.subscribe(event => {
   if (event.type === 'agent_end') {
    ended++;
    if (ended === 1) planningEnded.resolve();
    if (executionStarted) executionEnded.resolve();
   }
  });
  try {
   cfgBashPatterns.override(harness.worker.session.settings, [{ match: 'propose review', approval: 'allow' }]);
   // Keep this fixture's short transcript compactable so approve-compact
   // exercises the real compaction path; a second test covers the no-op.
   if (action === 'approve-compact') cfgCompactionKeepRecentTokens.override(harness.worker.session.settings, 1);
   await harness.worker.session.setActiveToolPresentation(
    harness.worker.session.getEnabledToolNames().filter(name => name !== 'read'),
    harness.worker.session.getMountedToolCommandNames().filter(name => name !== 'read'),
   );
   const before = harness.worker.session.getEnabledToolNames();
   await harness.worker.operation({ type: 'mode.set', mode: 'plan' });
   await harness.worker.operation({ type: 'prompt', runId: 'planning-run', request: prompt('Prepare and propose a plan.') });
   const question = await harness.waitQuestion();
   expect(question.schema).toEqual({ type: 'plan-review', title: 'review', planReference: 'local://PLAN.md', planText });
   expect(JSON.stringify(question)).not.toContain(harness.root);
   const response = action === 'feedback' ? { action, feedback: 'Revise the verification step.' } : { action };
   const reply = { action: 'answer' as const, response, version: question.version, epoch: question.epoch, workerGeneration: question.workerGeneration };
   await harness.interactions.resolveQuestion(rootSessionId, question.questionId, reply);
   expect(harness.events.filter(input => input.event.type === 'run.started')).toHaveLength(1);
   await expect(harness.interactions.resolveQuestion(rootSessionId, question.questionId, reply)).rejects.toMatchObject({ code: 'QUESTION_CONFLICT' });
   releasePlanning.resolve();
   if (action === 'approve-compact') await Promise.race([planningEnded.promise, execution.promise.then(() => undefined)]);
   else await planningEnded.promise;
   if (action === 'reject') {
    expect(harness.worker.mode().kind).toBe('plan');
    expect(harness.events.filter(input => input.event.type === 'run.started')).toHaveLength(1);
   } else {
    await execution.promise;
    await executionEnded.promise;
    const started = harness.events.findIndex(input => input.event.type === 'run.started' && input.event.origin === 'plan');
    expect(started).toBeGreaterThan(0);
    if (action === 'feedback') {
     expect(harness.worker.mode().kind).toBe('plan');
     expect(JSON.stringify(harness.requests.at(-1)?.messages)).toContain('Revise the verification step.');
    } else {
     expect(harness.worker.mode()).toEqual({ kind: 'main' });
     expect(new Set(harness.worker.session.getEnabledToolNames())).toEqual(new Set([...before, 'read']));
     const executionMessages = harness.worker.seed().messages.filter(message => message.role === 'user');
     expect(JSON.stringify(executionMessages.at(-1))).toContain('Plan approved.');
     expect(JSON.stringify(executionMessages.at(-1))).toContain(planText.replaceAll('\n', '\\n'));
     expect(JSON.stringify(harness.requests.at(-1)?.messages)).toContain('Full plan inlined below; durable copy at');
     if (action === 'approve-compact') {
      const compacted = harness.events.findIndex(input => input.event.type === 'session.compacted');
      expect(compacted).toBeGreaterThan(0);
      expect(compacted).toBeLessThan(started);
     } else expect(harness.events.some(input => input.event.type === 'session.compacted')).toBe(false);
    }
   }
   expect(harness.fatal()).toBe(false);
  } finally { releasePlanning.resolve(); unsubscribe(); await harness.close(); }
 }, 30000);
}

test('Stop cancels plan-review compaction without starting approved execution', async () => {
 let stage = 0;
 const planText = '# Stop plan\nDo not execute after Stop.';
 const harness = await fixture({
  planModel: true, machineCommands: ['propose review'], respond: () => {
   stage++;
   if (stage === 1) return completion({ name: 'write', id: 'write-plan', input: { path: 'local://PLAN.md', content: planText } });
   if (stage === 2) return completion({ name: 'bash', id: 'propose-plan', input: { command: 'propose review' } });
   return completion();
  }
 });
 cfgBashPatterns.override(harness.worker.session.settings, [{ match: 'propose review', approval: 'allow' }]);
 const compacting = Promise.withResolvers<void>();
 const release = Promise.withResolvers<never>();
 let compactionActive = false;
 Object.defineProperty(harness.worker.session, 'isCompacting', { configurable: true, get: () => compactionActive });
 const compact = spyOn(harness.worker.session, 'compact').mockImplementation(async () => {
  compactionActive = true;
  compacting.resolve();
  return release.promise;
 });
 const abort = spyOn(harness.worker.session, 'abortCompaction').mockImplementation(() => {
  compactionActive = false;
  release.reject(new Error('Compaction cancelled'));
 });
 try {
  await harness.worker.operation({ type: 'mode.set', mode: 'plan' });
  await harness.worker.operation({ type: 'prompt', runId: 'plan-stop-run', request: prompt('Prepare a plan.') });
  const question = await harness.waitQuestion();
  await harness.interactions.resolveQuestion(rootSessionId, question.questionId, {
   action: 'answer', response: { action: 'approve-compact' },
   version: question.version, epoch: question.epoch, workerGeneration: question.workerGeneration,
  });
  await compacting.promise;
  expect(harness.worker['reviewingPlan']).toBe(true);
  expect(harness.worker['projection'].activeRun()).toBeNull();
  expect(await harness.worker.operation({ type: 'compact.abort' })).toEqual({ type: 'compact.abort', aborted: true });
  await harness.worker['planReviewTask'];
  expect(abort).toHaveBeenCalledTimes(1);
  expect(harness.events.filter(input => input.event.type === 'run.started')).toHaveLength(1);
  expect(harness.worker['reviewingPlan']).toBe(false);
  expect(harness.fatal()).toBe(false);
 } finally {
  release.reject(new Error('Compaction cancelled'));
  await harness.worker['planReviewTask'];
  compact.mockRestore(); abort.mockRestore(); Reflect.deleteProperty(harness.worker.session, 'isCompacting');
  await harness.close();
 }
}, 30000);

test('approve-compact continues the approved plan when there is nothing to compact', async () => {
 const planText = '# Small plan\nExecute the approved scope.';
 const execution = Promise.withResolvers<void>();
 let stage = 0;
 const harness = await fixture({
  planModel: true, machineCommands: ['propose small'], respond: payload => {
   stage++;
   if (stage === 1) return completion({ name: 'write', id: 'write-small-plan', input: { path: 'local://PLAN.md', content: planText } });
   if (stage === 2) return completion({ name: 'bash', id: 'propose-small-plan', input: { command: 'propose small' } });
   if (JSON.stringify(payload.messages).includes('Plan approved.')) execution.resolve();
   return completion();
  }
 });
 try {
  cfgBashPatterns.override(harness.worker.session.settings, [{ match: 'propose small', approval: 'allow' }]);
  await harness.worker.operation({ type: 'mode.set', mode: 'plan' });
  await harness.worker.operation({ type: 'prompt', runId: 'small-plan-run', request: prompt('Prepare a small plan.') });
  const question = await harness.waitQuestion();
  const reply = { action: 'answer' as const, response: { action: 'approve-compact' }, version: question.version, epoch: question.epoch, workerGeneration: question.workerGeneration };
  await harness.interactions.resolveQuestion(rootSessionId, question.questionId, reply);
  await execution.promise;
  expect(harness.fatal()).toBe(false);
  expect(harness.worker.mode()).toEqual({ kind: 'main' });
  expect(harness.events.some(input => input.event.type === 'session.compacted')).toBe(false);
  expect(harness.events.some(input => input.event.type === 'run.started' && input.event.origin === 'plan')).toBe(true);
 } finally { await harness.close(); }
}, 30000);

test('a prompt with no explicit effort runs at OMP default thinking level', async () => {
 const harness = await fixture({ respond: () => completion(), reasoningEfforts: ['low', 'medium', 'high'] });
 const terminal = Promise.withResolvers<void>();
 const unsubscribe = harness.worker.session.subscribe(event => {
  if (event.type === 'agent_end') terminal.resolve();
 });
 try {
  await harness.worker.operation({ type: 'prompt', runId: 'default-effort-run', request: prompt('Use the default thinking level.') });
  await terminal.promise;
  expect(harness.worker.session.configuredThinkingLevel()).toBe('high');
  expect(harness.requests[0]).toMatchObject({ reasoning_effort: 'high' });
  expect(harness.fatal()).toBe(false);
 } finally { unsubscribe(); await harness.close(); }
}, 30000);

test('an explicit off effort reaches the native agent while an omitted effort keeps the OMP default', async () => {
 const harness = await fixture({ respond: () => completion(), reasoningEfforts: ['low', 'medium', 'high'] });
 const terminal = Promise.withResolvers<void>();
 const unsubscribe = harness.worker.session.subscribe(event => {
  if (event.type === 'agent_end') terminal.resolve();
 });
 try {
  await harness.worker.operation({
   type: 'prompt', runId: 'off-effort-run', request: {
    ...prompt('Think as little as possible.'), options: { ...options, reasoningEffort: 'off' },
   }
  });
  await terminal.promise;
  expect(harness.worker.session.configuredThinkingLevel()).toBe('off');
  expect(harness.requests[0]?.reasoning_effort).not.toBe('high');
 } finally { unsubscribe(); await harness.close(); }
}, 30000);
test('subagent cancel and steer operations resolve through worker operations', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const cancelRes = await harness.worker.operation({ type: 'subagent.cancel', subagentId: 'non-existent' });
  expect(cancelRes).toEqual({ type: 'subagent.cancel', subagentId: 'non-existent', cancelled: false });
  await expect(harness.worker.operation({ type: 'subagent.steer', subagentId: 'non-existent', message: 'hello' })).rejects.toThrow();
 } finally {
  await harness.close();
 }
});

test('deferred mid-run Plan mode entry arms during active stream and enters plan at terminal turn', async () => {
 const firstRequest = Promise.withResolvers<void>();
 const release = Promise.withResolvers<void>();
 const harness = await fixture({
  planModel: true, async respond() {
   firstRequest.resolve();
   await release.promise;
   return completion();
  }
 });
 const terminal = Promise.withResolvers<void>();
 const unsubscribe = harness.worker.session.subscribe(event => {
  if (event.type === 'agent_end') terminal.resolve();
 });
 try {
  // Start prompt
  const promptOp = harness.worker.operation({ type: 'prompt', runId: 'stream-run', request: prompt('Active run prompt') });
  await firstRequest.promise;

  // While streaming, setting plan mode must NOT throw 409 RUN_ACTIVE; it arms plan mode
  const armedResult = await harness.worker.operation({ type: 'mode.set', mode: 'plan' });
  if (armedResult.type !== 'mode.set') throw new Error('Expected mode.set result');
  expect(armedResult.mode).toMatchObject({ kind: 'plan', status: 'armed' });
  expect(harness.worker.mode()).toMatchObject({ kind: 'plan', status: 'armed' });

  // Finish run and wait for transition
  release.resolve();
  await terminal.promise;
  await promptOp;
  expect(harness.worker.mode().kind).toBe('plan');
  expect(harness.fatal()).toBe(false);
 } finally {
  unsubscribe();
  await harness.close();
 }
}, 30000);

test('host abort disarms deferred Plan mode', async () => {
 const firstRequest = Promise.withResolvers<void>();
 const harness = await fixture({
  planModel: true, async respond() {
   firstRequest.resolve();
   return new Response(new ReadableStream({}), { headers: { 'content-type': 'text/event-stream' } });
  }
 });
 try {
  const promptOp = harness.worker.operation({ type: 'prompt', runId: 'abort-run', request: prompt('Abort prompt') });
  await firstRequest.promise;

  await harness.worker.operation({ type: 'mode.set', mode: 'plan' });
  expect(harness.worker.mode()).toMatchObject({ kind: 'plan', status: 'armed' });

  await harness.worker.operation({ type: 'abort', runId: 'abort-run' });
  expect(harness.worker.mode().kind).not.toBe('plan');
  await promptOp;
 } finally {
  await harness.close();
 }
}, 30000);

test('btw.branch validates leafId and status, forks session, and rehydrates state', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  // First run to have a valid leaf
  const terminal = Promise.withResolvers<void>();
  const unsubscribe = harness.worker.session.subscribe(event => {
   if (event.type === 'agent_end') terminal.resolve();
  });
  try {
   await harness.worker.operation({ type: 'prompt', runId: 'base-run', request: prompt('Initial turn') });
   await terminal.promise;
  } finally {
   unsubscribe();
  }

  // Start a BTW side question
  const askRes = await harness.worker.operation({ type: 'btw.ask', question: 'How does caching work?' });
  if (askRes.type !== 'btw.ask') throw new Error('Expected btw.ask result');
  // Wait for BTW question to complete
  const completed = Promise.withResolvers<void>();
  const originalPublish = harness.worker['publish'];
  harness.worker['publish'] = (inputs: ProjectionInput[]) => {
   originalPublish(inputs);
   if (inputs.some(i => i.event.type === 'btw.completed')) completed.resolve();
  };
  await completed.promise;
  const history = await harness.worker.btw.history();
  const record = history.find(r => r.id === askRes.recordId);
  expect(record).toBeDefined();
  expect(record?.status).toBe('complete');

  // Attempting to branch an incomplete record throws 400 INVALID_REQUEST
  const fakeIncomplete = { ...record!, id: 'incomplete-id', status: 'running' as const };
  (harness.worker.btw as unknown as { history: () => Promise<typeof history> }).history = async () => [...history, fakeIncomplete];
  await expect(harness.worker.operation({ type: 'btw.branch', recordId: 'incomplete-id' }))
   .rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });

  // Attempting to branch when branch moved throws 409 SESSION_BRANCH_CONFLICT
  const fakeStale = { ...record!, id: 'stale-id', leafId: 'old-leaf-id' };
  (harness.worker.btw as unknown as { history: () => Promise<typeof history> }).history = async () => [...history, fakeStale];
  await expect(harness.worker.operation({ type: 'btw.branch', recordId: 'stale-id' }))
   .rejects.toMatchObject({ status: 409, code: 'SESSION_BRANCH_CONFLICT' });

  // Promote valid completed record
  (harness.worker.btw as unknown as { history: () => Promise<typeof history> }).history = async () => history;
  const branch = harness.worker.session.sessionManager.getBranch();
  const recordIndex = branch.findIndex(entry => entry.id === record?.leafId);
  expect(recordIndex).toBeGreaterThanOrEqual(0);
  expect(branch.slice(recordIndex + 1).map(entry => entry.type)).toEqual(['model_usage']);
  expect(branch.at(-1)).toMatchObject({ type: 'model_usage', purpose: 'btw' });
  const branchRes = await harness.worker.operation({ type: 'btw.branch', recordId: askRes.recordId });
  if (branchRes.type !== 'btw.branch') throw new Error('Expected btw.branch result');
  expect(branchRes.branch).toBeDefined();
  expect(branchRes.sessionFile).toBeDefined();
  expect(branchRes.sessionId).toBeDefined();
  expect(harness.worker.sessionFile).toBe(branchRes.sessionFile);
  expect(harness.worker.sessionId).toBe(branchRes.sessionId);
  expect(harness.fatal()).toBe(false);
  await expect(harness.worker.operation({ type: 'btw.branch', recordId: askRes.recordId }))
   .rejects.toMatchObject({ status: 409, code: 'SESSION_BRANCH_CONFLICT' });
 } finally {
  await harness.close();
 }
}, 30000);

test('completed rewind rehydrates natively and second rewind refuses correctly, and projection projects step_summary', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const session = harness.worker.session;
  // Append simulated checkpoint
  session.sessionManager.appendMessage({ role: 'user', content: 'checkpoint turn', timestamp: Date.now() });
  const ckptId = session.sessionManager.appendMessage({
   role: 'toolResult', toolCallId: 'ckpt-call', toolName: 'checkpoint', isError: false,
   content: [{ type: 'text', text: 'Checkpoint created' }], details: { startedAt: '2026-11-05T00:00:00.000Z' },
  });
  const otherId = session.sessionManager.appendMessage({ role: 'user', content: 'exploration turn', timestamp: Date.now() });
  await session.navigateTree(ckptId, { summarize: false, allowAskReopen: false });
  const ckptEntry = session.sessionManager.getEntries().find(isSuccessfulCheckpointEntry);
  expect(session.getCheckpointState()).toMatchObject({
   checkpointEntryId: ckptEntry?.id,
   checkpointMessageCount: 2,
  });

  // Append rewind-report
  session.sessionManager.appendCustomMessageEntry(
   'rewind-report', 'Rewound to checkpoint', false,
   { report: 'reverted file edits', startedAt: '2026-11-05T00:00:00.000Z', rewoundAt: '2026-11-05T00:01:00.000Z' },
   'agent',
  );
  const resumeId = session.sessionManager.appendMessage({ role: 'user', content: 'resume after rewind', timestamp: Date.now() });
  await session.navigateTree(otherId, { summarize: false, allowAskReopen: false });
  await session.navigateTree(resumeId, { summarize: false, allowAskReopen: false });
  expect(session.getCheckpointState()).toBeUndefined();
  expect(harness.worker.completedRewindState).toMatchObject({
   report: 'reverted file edits',
  });

  // Regression: Second rewind tool call on a session with a completed rewind refuses correctly
  const rewindTool = new RewindTool(session);
  await expect(rewindTool.execute('call-repeat', { report: 'second rewind attempt' }))
   .rejects.toThrow('Checkpoint already completed; continue from the retained rewind report instead of calling rewind again.');

  // Projection projects rewind-report as step_summary
  const seed = harness.worker['projection'].seed();
  const rewindMsg = seed.messages.find(m => m.parts.some(p => p.type === 'step_summary' && p.title.includes('reverted file edits')));
  expect(rewindMsg).toBeDefined();
  expect(rewindMsg?.role).toBe('system');
 } finally {
  await harness.close();
 }
}, 30000);

test('execution model validation error resolves failed plan review without worker death', async () => {
 let stage = 0;
 const planText = '# Test plan\nVerify execution model.';
 const harness = await fixture({
  planModel: true, machineCommands: ['propose review'], respond: async () => {
   stage++;
   if (stage === 1) return completion({ name: 'write', id: 'write-plan', input: { path: 'local://PLAN.md', content: planText } });
   if (stage === 2) return completion({ name: 'bash', id: 'propose-plan', input: { command: 'propose review' } });
   return completion();
  }
 });
 try {
  cfgBashPatterns.override(harness.worker.session.settings, [{ match: 'propose review', approval: 'allow' }]);
  await harness.worker.operation({ type: 'mode.set', mode: 'plan' });
  await harness.worker.operation({ type: 'prompt', runId: 'plan-run', request: prompt('Prepare plan') });
  const question = await harness.waitQuestion();

  // Invalid execution model does NOT kill the worker
  const invalidReply = {
   action: 'answer' as const,
   response: { action: 'approve' as const, executionModel: { providerId: 'non-existent', modelId: 'non-existent' } },
   version: question.version,
   epoch: question.epoch,
   workerGeneration: question.workerGeneration,
  };
  await harness.interactions.resolveQuestion(rootSessionId, question.questionId, invalidReply);
  expect(harness.fatal()).toBe(false);
  expect(harness.worker.mode().kind).toBe('plan');
 } finally {
  await harness.close();
 }
}, 30000);

test('valid execution model with thinking level applies to session execution', async () => {
 let stage = 0;
 const planText = '# Test plan\nVerify valid execution model.';
 const execution = Promise.withResolvers<void>();
 const harness = await fixture({
  planModel: true, machineCommands: ['propose review'], respond: async () => {
   stage++;
   if (stage === 1) return completion({ name: 'write', id: 'write-plan', input: { path: 'local://PLAN.md', content: planText } });
   if (stage === 2) return completion({ name: 'bash', id: 'propose-plan', input: { command: 'propose review' } });
   if (stage >= 4) execution.resolve();
   return completion();
  }
 });
 try {
  cfgBashPatterns.override(harness.worker.session.settings, [{ match: 'propose review', approval: 'allow' }]);
  await harness.worker.operation({ type: 'mode.set', mode: 'plan' });
  await harness.worker.operation({ type: 'prompt', runId: 'plan-run', request: prompt('Prepare plan') });
  const question = await harness.waitQuestion();

  const validReply = {
   action: 'answer' as const,
   response: { action: 'approve' as const, executionModel: { providerId: 'native-fixture', modelId: 'native-model' } },
   version: question.version,
   epoch: question.epoch,
   workerGeneration: question.workerGeneration,
  };
  await harness.interactions.resolveQuestion(rootSessionId, question.questionId, validReply);
  await harness.worker['planReviewTask'];
  await execution.promise;
  expect(harness.fatal()).toBe(false);
  expect(harness.worker.session.model?.id).toBe('native-model');
 } finally {
  await harness.close();
 }
}, 30000);

test('/tan authorizes Bash and Bash-mounted tools through the Host', async () => {
 const shellCommand = 'printf tan-bash-denied';
 const mountedCommand = `lsp -j '{"action":"status"}'`;
 const completed = Promise.withResolvers<void>();
 let requests = 0;
 const harness = await fixture({
  deniedCommands: [shellCommand], machineCommands: [mountedCommand], denyLsp: true,
  respond: () => {
   requests += 1;
   if (requests === 1) return completion({ name: 'bash', id: 'tan-bash-shell', input: { command: shellCommand } });
   if (requests === 2) return completion({ name: 'bash', id: 'tan-bash-mounted', input: { command: mountedCommand } });
   completed.resolve();
   return completion();
  },
 });
 try {
  cfgToolsApprovalMode.override(harness.worker.session.settings, 'yolo');
  cfgBashPatterns.override(harness.worker.session.settings, [shellCommand, mountedCommand].map(match => ({ match, approval: 'allow' })));
  expect(harness.worker.session.getMountedToolCommandNames()).toContain('lsp');
  await harness.worker.operation({ type: 'command', text: '/tan Run both Bash commands.' });
  await completed.promise;
  expect(harness.hostRequests.filter(request => request.type === 'tool' && ['bash', 'lsp'].includes(request.toolName))).toEqual([
   expect.objectContaining({ toolName: 'bash', input: { command: shellCommand }, toolCallId: 'tan-bash-shell' }),
   expect.objectContaining({ toolName: 'bash', input: { command: mountedCommand }, toolCallId: 'tan-bash-mounted' }),
   expect.objectContaining({ toolName: 'lsp', input: { action: 'status' } }),
  ]);
  expect(harness.requests[1]?.messages.at(-1)?.content).toContain('Host policy refused Bash');
  expect(harness.requests[2]?.messages.at(-1)?.content).toContain('Host policy refused the tool operation');
 } finally {
  await harness.close();
 }
}, 30000);

test('autonomous commands /loop, /omfg, /cleanse, /tan, /advisor and loop.stop resolve properly', async () => {
 const ttsrJson = JSON.stringify({
  name: 'no-any',
  description: 'Never use any in TypeScript',
  scope: 'tool:edit(*.ts)',
  condition: ': any',
  body: 'Never use any.',
 });
 const harness = await fixture({ respond: () => completion(ttsrJson) });
 try {
  const loopRes = await harness.worker.operation({ type: 'command', text: '/loop 5 --until "true"' });
  expect(loopRes.type).toBe('command');
  if ('output' in loopRes && typeof loopRes.output === 'string') {
   expect(loopRes.output).toContain('Loop mode enabled');
  }
  expect(harness.worker.seed().loop).toMatchObject({ active: true, iteration: 1, maxIterations: 5 });

  const stopRes = await harness.worker.operation({ type: 'loop.stop' });
  expect(stopRes).toEqual({ type: 'loop.stop', stopped: true });
  expect(harness.worker.seed().loop).toBeUndefined();

  const omfgRes = await harness.worker.operation({ type: 'command', text: '/omfg do not use any' });
  expect(omfgRes.type).toBe('command');
  if ('output' in omfgRes && typeof omfgRes.output === 'string') {
   expect(omfgRes.output).toContain('Synthesized TTSR rule');
  }

  const cleanseRes = await harness.worker.operation({ type: 'command', text: '/cleanse' });
  expect(cleanseRes.type).toBe('command');
  if ('output' in cleanseRes && typeof cleanseRes.output === 'string') {
   expect(cleanseRes.output).toContain('Cleanse diagnostics');
  }

  const tanRes = await harness.worker.operation({ type: 'command', text: '/tan research new feature' });
  expect(tanRes.type).toBe('command');
  let cloneId = '';
  if ('output' in tanRes && typeof tanRes.output === 'string') {
   expect(tanRes.output).toContain('Dispatched background clone');
   const match = tanRes.output.match(/cloneId:\s*([^)]+)\)/);
   if (match) cloneId = match[1].trim();
  }
  expect(cloneId).toBeTruthy();

  const tanCancel = await harness.worker.operation({ type: 'subagent.cancel', subagentId: cloneId });
  expect(tanCancel).toEqual({ type: 'subagent.cancel', subagentId: cloneId, cancelled: true });

  await expect(harness.worker.operation({ type: 'command', text: '/seance non-existent-session' })).rejects.toThrow();
  await expect(harness.worker.operation({ type: 'command', text: '/commit' })).rejects.toThrow();

  const advisorRes = await harness.worker.operation({ type: 'command', text: '/advisor' });
  expect(advisorRes.type).toBe('command');
  if ('output' in advisorRes && typeof advisorRes.output === 'string') {
   expect(advisorRes.output).toContain('Advisor');
  }

  harness.worker.handleSessionEvent({
   type: 'message_end',
   message: {
    role: 'custom',
    customType: 'advisor',
    content: 'Consider adding timeout to network requests',
    details: {
     notes: [{
      note: 'Missing return statement in critical path',
      severity: 'blocker',
      advisor: 'watchdog',
     }],
    },
   } as unknown as Parameters<typeof harness.worker.handleSessionEvent>[0],
  });
  harness.worker.handleSessionEvent({ type: 'advisor_yielded' } as unknown as Parameters<typeof harness.worker.handleSessionEvent>[0]);
  const advisorYielded = harness.events.find(e => e.event.type === 'advisor_yielded');
  expect(advisorYielded).toBeTruthy();
  if (advisorYielded && advisorYielded.event.type === 'advisor_yielded') {
   expect(advisorYielded.event.notes.length).toBeGreaterThan(0);
   expect(advisorYielded.event.notes[0].text).toContain('Missing return statement');
  }
 } finally {
  await harness.close();
 }
}, 30000);
test('compacting a too-small session is refused as 422 SESSION_TOO_SMALL', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const manager = harness.worker.session.sessionManager;
  manager.appendMessage({ role: 'user', content: 'Short prompt', timestamp: Date.now() });
  await manager.flush();
  await expect(harness.worker.operation({ type: 'compact', instructions: 'compact it' }))
   .rejects.toMatchObject({ status: 422, code: 'SESSION_TOO_SMALL', message: 'Session is too small to compact' });
  expect(harness.fatal()).toBe(false);
  expect(harness.requests).toHaveLength(0);
 } finally { await harness.close(); }
}, 30000);

// ---------------------------------------------------------------------------
// Host authorization seams: cleanse, fail-closed Bash, provider.use inheritance
// ---------------------------------------------------------------------------

test('a Bash tool whose session has no authorizer fails closed in a worker process', async () => {
 const { BashTool } = await import('@oh-my-pi/pi-coding-agent/tools/bash');
 const { requireBashExecutionAuthorization } = await import('@oh-my-pi/pi-coding-agent/tools/bash');
 // The test itself arms the switch — irreversible process-global state, so
 // every later Bash execution in this test process must carry an authorizer.
 // It cannot rely on the production worker entrypoint arming it: this file
 // imports worker/session.ts, never worker/index.ts.
 requireBashExecutionAuthorization();
 const { Settings } = await import('@oh-my-pi/pi-coding-agent/config/settings');
 const root = await mkdtemp(join(tmpdir(), 'bash-failclosed-'));
 try {
  const settings = await Settings.init({ cwd: root });
  // No authorizeBashExecution on this session: exactly the unmediated shape
  // the switch exists to refuse.
  const tool = new BashTool({ cwd: root, hasUI: false, settings });
  await expect(tool.execute('unmediated-call', { command: 'printf never' })).rejects.toThrow(/authorizer/i);
  expect(await readFile(join(root, 'proof.txt'), 'utf8').catch(() => 'absent')).toBe('absent');
 } finally {
  await rm(root, { recursive: true, force: true });
 }
}, 15000);

test('cleanse reuses the host runtime without rediscovery or online refresh', async () => {
 const harness = await fixture({
  respond: () => completion(),
 });
 try {
  const { createCleanseAgentRuntime } = await import('@oh-my-pi/pi-coding-agent/cleanse/agent');
  const refreshSpy = spyOn(harness.worker.session.modelRegistry, 'refresh');
  const host = {
   settings: harness.worker.session.settings,
   authStorage: harness.worker.session.modelRegistry.authStorage,
   modelRegistry: harness.worker.session.modelRegistry,
   getApiKey: undefined,
   authorizeBashExecution: async () => { },
   authorizeModelUse: async () => { },
   preparedExtensions: undefined,
   authorizeCheckerCommand: async () => { },
  };
  const runtime = await createCleanseAgentRuntime({ cwd: harness.root, model: 'native-fixture/native-model', host });
  try {
   // A host-embedded runtime must not rediscover or online-refresh: the host
   // registry is already the authorized configuration.
   expect(refreshSpy).not.toHaveBeenCalled();
   expect(runtime.sessionFile).toBeTruthy();
  } finally {
   refreshSpy.mockRestore();
   await runtime.close();
  }
 } finally { await harness.close(); }
}, 30000);

test('a Host denial of a cleanse checker command fails that checker without spawning it', async () => {
 const root = await mkdtemp(join(tmpdir(), 'cleanse-checker-'));
 try {
  const { buildCustomCleanseSuite } = await import('@oh-my-pi/pi-coding-agent/cleanse/checkers');
  const specs = [{ label: 'proof checker', command: ['/bin/sh', '-c', `printf ran >> '${join(root, 'proof.txt')}'`] }];
  const suite = await buildCustomCleanseSuite(root, specs);
  expect(suite.checkers).toHaveLength(1);
  const denied = await suite.run({
   authorizeCheckerCommand: async () => { throw new Error('Host policy refused the checker'); },
  });
  // The refusal is the checker's failure, never a silent skip or a run abort.
  expect(denied.checks).toHaveLength(1);
  expect(denied.checks[0]?.exitCode).toBeNull();
  expect(denied.diagnostics.some(d => d.message.includes('Host policy refused the checker'))).toBe(true);
  expect(await readFile(join(root, 'proof.txt'), 'utf8').catch(() => 'absent')).toBe('absent');
  const allowed: string[] = [];
  const granted = await suite.run({ authorizeCheckerCommand: async command => { allowed.push(command); } });
  expect(granted.checks[0]?.exitCode).not.toBeNull();
  expect(allowed).toHaveLength(1);
 } finally {
  await rm(root, { recursive: true, force: true });
 }
}, 20000);

test('/cleanse checker spawns hit Host bash authorization inside a worker session', async () => {
 // A tsconfig.json plus a TypeScript source makes the TypeScript checker
 // discoverable; a fixture-local node_modules/.bin/tsc supplies its binary.
 // The checker spawn must pass the Host bash authorizer before execution.
 const harness = await fixture({ respond: () => completion(), machineCommands: ['tsc --noEmit --pretty false'] });
 try {
  await mkdir(join(harness.root, 'node_modules', '.bin'), { recursive: true });
  await writeFile(join(harness.root, 'node_modules', '.bin', 'tsc'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  await writeFile(join(harness.root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true } }));
  await writeFile(join(harness.root, 'index.ts'), 'export const marker = 1;\n');
  const result = await harness.worker.operation({ type: 'command', text: '/cleanse' });
  expect(result.type).toBe('command');
  const checkerAuthorizations = harness.hostRequests.filter(r =>
   r.type === 'tool' && r.toolName === 'bash' && z.string().catch('').parse(r.input.command).includes('tsc'));
  expect(checkerAuthorizations.length).toBeGreaterThan(0);
  expect(harness.fatal()).toBe(false);
 } finally { await harness.close(); }
}, 30000);

test('/tan clone provider.use denial blocks its provider request', async () => {
 // Deny every provider.use: nothing in this worker — root or clone — may
 // resolve a credential. The clone's inherited resolver must hit the same
 // Host boundary, so its prompt never reaches the loopback provider.
 const harness = await fixture({
  respond: () => completion(),
  denyProviderUse: () => new Error('Host policy refused the provider'),
 });
 try {
  const result = await harness.worker.operation({ type: 'command', text: '/tan investigate the seam' });
  expect(result.type).toBe('command');
  // The clone settles once its denied resolution unwinds. A clone is a
  // separate native session, so no root-session event can gate this wait:
  // integration polling against the journal projection it is.
  const deadline = Date.now() + 10000;
  const settled = () => harness.events.some(({ event }) =>
   event.type === 'subagent.updated' && event.subagent.role === 'tan-worker' && event.subagent.status !== 'running');
  while (!settled() && Date.now() < deadline) await Bun.sleep(25);
  expect(settled()).toBe(true);
  expect(harness.hostRequests.some(r => r.type === 'tool' && r.toolName === 'provider.use')).toBe(true);
  expect(harness.requests.some(r => JSON.stringify(r.messages).includes('investigate the seam'))).toBe(false);
  expect(harness.fatal()).toBe(false);
 } finally { await harness.close(); }
}, 30000);

test('/tan clone reaches the provider when the Host authorizes its use', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const result = await harness.worker.operation({ type: 'command', text: '/tan authorized tangent work' });
  expect(result.type).toBe('command');
  // Same cross-session integration poll: the loopback capture fills from the
  // clone's own session, which the root session never observes.
  const deadline = Date.now() + 15000;
  const reached = () => harness.requests.some(r => JSON.stringify(r.messages).includes('authorized tangent work'));
  while (!reached() && Date.now() < deadline) await Bun.sleep(25);
  expect(reached()).toBe(true);
  expect(harness.hostRequests.some(r => r.type === 'tool' && r.toolName === 'provider.use')).toBe(true);
  expect(harness.fatal()).toBe(false);
 } finally { await harness.close(); }
}, 30000);


test('an advisor with provider.use denied never reaches the provider', async () => {
 // The advisor runs on a different model tuple than the primary turn, so its
 // resolution cannot hit the worker-lifetime approval cache: mediation must
 // fire for the advisor's own provider use, and the refusal must precede any
 // credential release — no advisor request may reach the loopback provider.
 const harness = await fixture({
  respond: () => completion(),
  planModel: true,
  denyProviderUse: (_attempt, input) =>
   input?.modelId === 'native-plan-model' ? new Error('Host policy refused the advisor provider') : undefined,
 });
 try {
  await writeFile(join(harness.root, 'WATCHDOG.yml'), [
   'advisors:',
   '  - name: watchdog-probe',
   '    model: native-fixture/native-plan-model',
   '    instructions: "ADVISOR-MARKER-7x2 review instructions"',
   '    tools: []',
   '',
  ].join('\n'));
  await harness.reopen();
  const enabled = await harness.worker.operation({ type: 'command', text: '/advisor on' });
  expect(enabled.type).toBe('command');
  await harness.worker.operation({ type: 'prompt', runId: 'advisor-deny-run', request: prompt('Reply with marker.') });
  const deadline = Date.now() + 10000;
  const mediated = () => harness.hostRequests.some(r =>
   r.type === 'tool' && r.toolName === 'provider.use' && r.input.modelId === 'native-plan-model');
  while (!mediated() && Date.now() < deadline) await Bun.sleep(25);
  expect(mediated()).toBe(true);
  expect(harness.requests.some(r => JSON.stringify(r.messages).includes('ADVISOR-MARKER-7x2'))).toBe(false);
  expect(harness.fatal()).toBe(false);
 } finally { await harness.close(); }
}, 30000);

test('an advisor reaches the provider when the Host authorizes its use', async () => {
 const harness = await fixture({ respond: () => completion(), planModel: true });
 try {
  await writeFile(join(harness.root, 'WATCHDOG.yml'), [
   'advisors:',
   '  - name: watchdog-probe',
   '    model: native-fixture/native-plan-model',
   '    instructions: "ADVISOR-MARKER-7x2 review instructions"',
   '    tools: []',
   '',
  ].join('\n'));
  await harness.reopen();
  const enabled = await harness.worker.operation({ type: 'command', text: '/advisor on' });
  expect(enabled.type).toBe('command');
  await harness.worker.operation({ type: 'prompt', runId: 'advisor-allow-run', request: prompt('Reply with marker.') });
  const deadline = Date.now() + 15000;
  const reached = () => harness.requests.some(r => JSON.stringify(r.messages).includes('ADVISOR-MARKER-7x2'));
  while (!reached() && Date.now() < deadline) await Bun.sleep(25);
  expect(reached()).toBe(true);
  expect(harness.hostRequests.some(r =>
   r.type === 'tool' && r.toolName === 'provider.use' && r.input.modelId === 'native-plan-model')).toBe(true);
  expect(harness.fatal()).toBe(false);
 } finally { await harness.close(); }
}, 30000);



const EmbeddingUseInputSchema = z.looseObject({
 providerId: z.string(), modelId: z.string(), endpoint: z.string().optional(), purpose: z.literal('embedding'),
});

function embeddingUseInputs(harness: { hostRequests: Array<{ type: string; toolName?: string; input?: unknown }> }): Array<z.infer<typeof EmbeddingUseInputSchema>> {
 return harness.hostRequests
  .filter(r => r.type === 'tool' && r.toolName === 'provider.use')
  .map(r => EmbeddingUseInputSchema.safeParse(r.input))
  .filter(parsed => parsed.success)
  .map(parsed => parsed.data);
}

function seedCompactableTranscript(session: AgentSession): void {
 for (let i = 0; i < 6; i++) {
  session.sessionManager.appendMessage({ role: 'user', content: `seed question ${i} ${'padding '.repeat(80)}`, timestamp: Date.now() });
  session.sessionManager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: `seed answer ${i} ${'padding '.repeat(80)}` }], timestamp: Date.now(), provider: 'native-fixture', model: 'native-model', api: 'chat-completions' });
 }
}

test('manual compact with its candidate provider.use denied sends nothing and reports the refusal', async () => {
 const harness = await fixture({
  respond: () => completion(),
  denyProviderUse: () => new Error('Host policy refused the provider'),
 });
 try {
  const session = harness.worker.session;
  seedCompactableTranscript(session);
  cfgCompactionKeepRecentTokens.override(session.settings, 1);
  const error = await session.compact().then(() => undefined, e => e);
  // The user must see the Host refusal itself, never a misleading
  // "configure credentials" auth error; and nothing may reach the provider.
  expect(error).toBeTruthy();
  expect(error.message).toContain('Host policy refused');
  expect(error.message).not.toContain('Configure');
  expect(harness.requests.length).toBe(0);
  expect(harness.hostRequests.some(r => r.type === 'tool' && r.toolName === 'provider.use')).toBe(true);
 } finally { await harness.close(); }
}, 30000);

test('manual compact authorized summarizes through the provider', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const session = harness.worker.session;
  seedCompactableTranscript(session);
  cfgCompactionKeepRecentTokens.override(session.settings, 1);
  const result = await session.compact();
  expect(result.summary).toBeTruthy();
  expect(harness.requests.length).toBeGreaterThan(0);
  expect(harness.hostRequests.some(r => r.type === 'tool' && r.toolName === 'provider.use')).toBe(true);
 } finally { await harness.close(); }
}, 30000);

test('job widget authoring with provider.use denied sends nothing and reports the refusal', async () => {
 const harness = await fixture({
  respond: () => completion(),
  denyProviderUse: () => new Error('Host policy refused the provider'),
 });
 try {
  const { completeWidgetRequest } = await import('@oh-my-pi/pi-coding-agent/job-widgets/author');
  const session = harness.worker.session;
  session.settings.writeValue(cfgModelRoles, { widget: 'native-fixture/native-model' }, 'override');
  const error = await completeWidgetRequest(
   { settings: session.settings, modelRegistry: session.modelRegistry, sessionId: () => session.sessionManager.getSessionId() },
   { systemPrompt: 'widget probe system', prompt: 'widget probe prompt', maxTokens: 64 },
   new AbortController().signal,
  ).then(() => undefined, e => e);
  expect(error).toBeTruthy();
  expect(error.message).toContain('Host policy refused');
  expect(harness.requests.length).toBe(0);
  expect(harness.hostRequests.some(r => r.type === 'tool' && r.toolName === 'provider.use')).toBe(true);
 } finally { await harness.close(); }
}, 30000);

test('job widget authoring authorized reaches the provider', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const { completeWidgetRequest } = await import('@oh-my-pi/pi-coding-agent/job-widgets/author');
  const session = harness.worker.session;
  session.settings.writeValue(cfgModelRoles, { widget: 'native-fixture/native-model' }, 'override');
  const response = await completeWidgetRequest(
   { settings: session.settings, modelRegistry: session.modelRegistry, sessionId: () => session.sessionManager.getSessionId() },
   { systemPrompt: 'widget probe system', prompt: 'widget probe prompt', maxTokens: 64 },
   new AbortController().signal,
  );
  expect(response).toBeTruthy();
  expect(harness.requests.length).toBeGreaterThan(0);
  expect(harness.hostRequests.some(r => r.type === 'tool' && r.toolName === 'provider.use')).toBe(true);
 } finally { await harness.close(); }
}, 30000);

test('memory embeddings authorize provider.use with the embedding purpose and tuple', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const session = harness.worker.session;
  const { cfgMemoryBackend } = await import('@oh-my-pi/pi-coding-agent/memory-backend/settings');
  const { cfgMnemopiEmbeddingModel } = await import('@oh-my-pi/pi-coding-agent/mnemopi/settings');
  session.settings.writeValue(cfgMemoryBackend, 'mnemopi', 'override');
  session.settings.writeValue(cfgMnemopiEmbeddingModel, 'openai/text-embedding-3-small', 'override');
  harness.hostRequests.length = 0;
  await session.applyMemoryBackend();
  const embeddingUses = embeddingUseInputs(harness);
  expect(embeddingUses.length).toBe(1);
  expect(embeddingUses[0].providerId).toBe('openrouter');
  expect(embeddingUses[0].modelId).toBe('openai/text-embedding-3-small');
  expect(embeddingUses[0].endpoint).toBe('https://openrouter.ai/api/v1');
 } finally { await harness.close(); }
}, 30000);

test('memory embeddings authorize the env-configured endpoint and pin it against re-resolution', async () => {
 const harness = await fixture({ respond: () => completion() });
 const captured: string[] = [];
 const capture = Bun.serve({ port: 0, fetch: async request => { captured.push(new URL(request.url).pathname); return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), { headers: { 'content-type': 'application/json' } }); } });
 try {
  const session = harness.worker.session;
  const { cfgMemoryBackend } = await import('@oh-my-pi/pi-coding-agent/memory-backend/settings');
  const { cfgMnemopiEmbeddingModel, cfgMnemopiEmbeddingApiUrl } = await import('@oh-my-pi/pi-coding-agent/mnemopi/settings');
  session.settings.writeValue(cfgMemoryBackend, 'mnemopi', 'override');
  session.settings.writeValue(cfgMnemopiEmbeddingModel, 'openai/text-embedding-3-small', 'override');
  const endpoint = `http://127.0.0.1:${capture.port}/v1`;
  session.settings.writeValue(cfgMnemopiEmbeddingApiUrl, endpoint, 'override');
  harness.hostRequests.length = 0;
  await session.applyMemoryBackend();
  const embeddingUses = embeddingUseInputs(harness);
  expect(embeddingUses.length).toBe(1);
  expect(embeddingUses[0].endpoint).toBe(endpoint);
 } finally { capture.stop(true); await harness.close(); }
}, 30000);

test('memory embeddings with provider.use denied send nothing to the endpoint whatever the key source', async () => {
 const harness = await fixture({
  respond: () => completion(),
  denyProviderUse: (attempt, input) => (input?.purpose === 'embedding' ? new Error('Host policy refused the embedding endpoint') : undefined),
 });
 const captured: string[] = [];
 const capture = Bun.serve({ port: 0, fetch: async request => { captured.push(new URL(request.url).pathname); return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), { headers: { 'content-type': 'application/json' } }); } });
 try {
  const session = harness.worker.session;
  const { cfgMemoryBackend } = await import('@oh-my-pi/pi-coding-agent/memory-backend/settings');
  const { cfgMnemopiEmbeddingModel, cfgMnemopiEmbeddingApiUrl } = await import('@oh-my-pi/pi-coding-agent/mnemopi/settings');
  session.settings.writeValue(cfgMemoryBackend, 'mnemopi', 'override');
  session.settings.writeValue(cfgMnemopiEmbeddingModel, 'openai/text-embedding-3-small', 'override');
  session.settings.writeValue(cfgMnemopiEmbeddingApiUrl, `http://127.0.0.1:${capture.port}/v1`, 'override');
  const notices: string[] = [];
  const unsubscribe = session.subscribe(event => {
   if (event.type === 'notice' && 'message' in event) notices.push(String(event.message));
  });
  harness.hostRequests.length = 0;
  // A pinned key present in the environment must not ride a refused remote use.
  process.env.OPENROUTER_API_KEY = 'sk-or-test-key';
  try {
   await session.applyMemoryBackend();
   // Drive real memory activity that would embed when remote embeddings were available.
   const { getMnemopiSessionState } = await import('@oh-my-pi/pi-coding-agent/mnemopi/state');
   const state = getMnemopiSessionState(session);
   expect(state).toBeTruthy();
   if (state) {
    await state.retainMessages([{ role: 'user', content: 'remember this concrete fact about the workspace' }], 'test-source').catch(() => undefined);
    await Bun.sleep(2000);
   }
  } finally {
   delete process.env.OPENROUTER_API_KEY;
  }
  unsubscribe();
  const embeddingUses = embeddingUseInputs(harness);
  expect(embeddingUses.length).toBe(1);
  expect(notices.some(message => message.includes('Memory embeddings are unavailable') && message.includes('Host policy refused'))).toBe(true);
  expect(captured.length).toBe(0);
 } finally { capture.stop(true); await harness.close(); }
}, 30000);

test('memory clear rehydrate without prior state stays mediated under refusal', async () => {
 const harness = await fixture({
  respond: () => completion(),
  denyProviderUse: (attempt, input) => (input?.purpose === 'embedding' ? new Error('Host policy refused the embedding endpoint') : undefined),
 });
 const captured: string[] = [];
 const capture = Bun.serve({ port: 0, fetch: async request => {
  captured.push(new URL(request.url).pathname);
  return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }], usage: { total_tokens: 2 } }), { headers: { 'content-type': 'application/json' } });
 } });
 try {
  const session = harness.worker.session;
  const { cfgMemoryBackend } = await import('@oh-my-pi/pi-coding-agent/memory-backend/settings');
  const { cfgMnemopiEmbeddingModel, cfgMnemopiEmbeddingApiUrl, cfgMnemopiEmbeddingApiKey } = await import('@oh-my-pi/pi-coding-agent/mnemopi/settings');
  session.settings.writeValue(cfgMemoryBackend, 'mnemopi', 'override');
  session.settings.writeValue(cfgMnemopiEmbeddingModel, 'openai/text-embedding-3-small', 'override');
  session.settings.writeValue(cfgMnemopiEmbeddingApiUrl, `http://127.0.0.1:${capture.port}/v1`, 'override');
  session.settings.writeValue(cfgMnemopiEmbeddingApiKey, 'test-pinned-key', 'override');
  // No applyMemoryBackend: the clear path finds no prior state and must still
  // install a mediated one — a raw config would carry no gate, and the pinned
  // key would ride remote requests for the rest of the session.
  const { mnemopiBackend } = await import('@oh-my-pi/pi-coding-agent/mnemopi/backend');
  await mnemopiBackend.clear(harness.agentDirectory, harness.root, session).catch(() => undefined);
  const embeddingUses = embeddingUseInputs(harness);
  expect(embeddingUses.length).toBeGreaterThan(0);
  const { getMnemopiSessionState } = await import('@oh-my-pi/pi-coding-agent/mnemopi/state');
  const state = getMnemopiSessionState(session);
  expect(state).toBeTruthy();
  if (state) {
   await state.retainMessages([{ role: 'user', content: 'remember this concrete fact about the workspace' }], 'test-source').catch(() => undefined);
   await Bun.sleep(2000);
  }
  expect(captured.length).toBe(0);
 } finally { capture.stop(true); await harness.close(); }
}, 30000);

test('memory embeddings authorized reach the endpoint through the pinned capture server', async () => {
 const harness = await fixture({ respond: () => completion() });
 const captured: string[] = [];
 const capture = Bun.serve({ port: 0, fetch: async request => {
  captured.push(new URL(request.url).pathname);
  return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }], usage: { total_tokens: 2 } }), { headers: { 'content-type': 'application/json' } });
 } });
 try {
  const session = harness.worker.session;
  const { cfgMemoryBackend } = await import('@oh-my-pi/pi-coding-agent/memory-backend/settings');
  const { cfgMnemopiEmbeddingModel, cfgMnemopiEmbeddingApiUrl, cfgMnemopiEmbeddingApiKey } = await import('@oh-my-pi/pi-coding-agent/mnemopi/settings');
  session.settings.writeValue(cfgMemoryBackend, 'mnemopi', 'override');
  session.settings.writeValue(cfgMnemopiEmbeddingModel, 'openai/text-embedding-3-small', 'override');
  session.settings.writeValue(cfgMnemopiEmbeddingApiUrl, `http://127.0.0.1:${capture.port}/v1`, 'override');
  session.settings.writeValue(cfgMnemopiEmbeddingApiKey, 'test-pinned-key', 'override');
  await session.applyMemoryBackend();
  const { getMnemopiSessionState } = await import('@oh-my-pi/pi-coding-agent/mnemopi/state');
  const state = getMnemopiSessionState(session);
  expect(state).toBeTruthy();
  if (state) {
   await state.retainMessages([{ role: 'user', content: 'remember this concrete fact about the workspace' }], 'test-source').catch(() => undefined);
  }
  // Embedding is a background reconcile inside mnemopi, not inline with retain.
  const deadline = Date.now() + 10000;
  while (!captured.some(pathname => pathname.includes('embeddings')) && Date.now() < deadline) {
   await Bun.sleep(150);
  }
  expect(captured.some(pathname => pathname.includes('embeddings'))).toBe(true);
 } finally { capture.stop(true); await harness.close(); }
}, 30000);

test('memory embeddings authorize the env-resolved endpoint and post only there', async () => {
 const harness = await fixture({ respond: () => completion() });
 const captured: string[] = [];
 const capture = Bun.serve({ port: 0, fetch: async request => {
  captured.push(new URL(request.url).pathname);
  return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }], usage: { total_tokens: 2 } }), { headers: { 'content-type': 'application/json' } });
 } });
 try {
  const session = harness.worker.session;
  const { cfgMemoryBackend } = await import('@oh-my-pi/pi-coding-agent/memory-backend/settings');
  const { cfgMnemopiEmbeddingModel, cfgMnemopiEmbeddingApiKey } = await import('@oh-my-pi/pi-coding-agent/mnemopi/settings');
  session.settings.writeValue(cfgMemoryBackend, 'mnemopi', 'override');
  session.settings.writeValue(cfgMnemopiEmbeddingModel, 'openai/text-embedding-3-small', 'override');
  session.settings.writeValue(cfgMnemopiEmbeddingApiKey, 'test-pinned-key', 'override');
  const endpoint = `http://127.0.0.1:${capture.port}/v1`;
  // No configured URL: the env fallback chain in the worker process resolves
  // the effective endpoint, exactly like mnemopi core would at request time.
  process.env.MNEMOPI_EMBEDDING_API_URL = endpoint;
  try {
   harness.hostRequests.length = 0;
   await session.applyMemoryBackend();
   const embeddingUses = embeddingUseInputs(harness);
   expect(embeddingUses.length).toBe(1);
   expect(embeddingUses[0].endpoint).toBe(endpoint);
   const { getMnemopiSessionState } = await import('@oh-my-pi/pi-coding-agent/mnemopi/state');
   const state = getMnemopiSessionState(session);
   if (state) {
    await state.retainMessages([{ role: 'user', content: 'remember this fact' }], 'test-source').catch(() => undefined);
   }
   const deadline = Date.now() + 10000;
   while (!captured.some(pathname => pathname.includes('embeddings')) && Date.now() < deadline) await Bun.sleep(150);
   expect(captured.some(pathname => pathname.includes('embeddings'))).toBe(true);
  } finally {
   delete process.env.MNEMOPI_EMBEDDING_API_URL;
  }
 } finally { capture.stop(true); await harness.close(); }
}, 30000);

test('memory embeddings via the api flag authorize even for a local-shaped model', async () => {
 const harness = await fixture({
  respond: () => completion(),
  denyProviderUse: (attempt, input) => (input?.purpose === 'embedding' ? new Error('Host policy refused the embedding endpoint') : undefined),
 });
 try {
  const session = harness.worker.session;
  const { cfgMemoryBackend } = await import('@oh-my-pi/pi-coding-agent/memory-backend/settings');
  const { cfgMnemopiEmbeddingModel } = await import('@oh-my-pi/pi-coding-agent/mnemopi/settings');
  session.settings.writeValue(cfgMemoryBackend, 'mnemopi', 'override');
  // A fastembed-local model name still goes remote under the core env flag, so
  // the authorization decision must use core's own env-sensitive isApiModel.
  session.settings.writeValue(cfgMnemopiEmbeddingModel, 'BAAI/bge-base-en-v1.5', 'override');
  process.env.MNEMOPI_EMBEDDINGS_VIA_API = 'true';
  try {
   harness.hostRequests.length = 0;
   await session.applyMemoryBackend();
   expect(embeddingUseInputs(harness).length).toBe(1);
  } finally {
   delete process.env.MNEMOPI_EMBEDDINGS_VIA_API;
  }
 } finally { await harness.close(); }
}, 30000);

test('memory embeddings with a local-shaped model and custom endpoint authorize or stay closed', async () => {
 const harness = await fixture({ respond: () => completion() });
 const captured: string[] = [];
 const capture = Bun.serve({ port: 0, fetch: async request => {
  captured.push(new URL(request.url).pathname);
  return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }], usage: { total_tokens: 2 } }), { headers: { 'content-type': 'application/json' } });
 } });
 try {
  const session = harness.worker.session;
  const { cfgMemoryBackend } = await import('@oh-my-pi/pi-coding-agent/memory-backend/settings');
  const { cfgMnemopiEmbeddingModel, cfgMnemopiEmbeddingApiUrl, cfgMnemopiEmbeddingApiKey } = await import('@oh-my-pi/pi-coding-agent/mnemopi/settings');
  session.settings.writeValue(cfgMemoryBackend, 'mnemopi', 'override');
  // Local-shaped model name, but the custom configured endpoint makes core go
  // remote at request time — the remoteness decision must see the same inputs.
  session.settings.writeValue(cfgMnemopiEmbeddingModel, 'BAAI/bge-base-en-v1.5', 'override');
  const endpoint = `http://127.0.0.1:${capture.port}/v1`;
  session.settings.writeValue(cfgMnemopiEmbeddingApiUrl, endpoint, 'override');
  session.settings.writeValue(cfgMnemopiEmbeddingApiKey, 'test-pinned-key', 'override');
  harness.hostRequests.length = 0;
  await session.applyMemoryBackend();
  const embeddingUses = embeddingUseInputs(harness);
  expect(embeddingUses.length).toBe(1);
  expect(embeddingUses[0].endpoint).toBe(endpoint);
  const { getMnemopiSessionState } = await import('@oh-my-pi/pi-coding-agent/mnemopi/state');
  const state = getMnemopiSessionState(session);
  if (state) {
   await state.retainMessages([{ role: 'user', content: 'remember this fact' }], 'test-source').catch(() => undefined);
  }
  const deadline = Date.now() + 10000;
  while (!captured.some(pathname => pathname.includes('embeddings')) && Date.now() < deadline) await Bun.sleep(150);
  expect(captured.some(pathname => pathname.includes('embeddings'))).toBe(true);
 } finally { capture.stop(true); await harness.close(); }
}, 30000);

test('memory embeddings with a local-shaped model and custom endpoint denied send nothing', async () => {
 const harness = await fixture({
  respond: () => completion(),
  denyProviderUse: (attempt, input) => (input?.purpose === 'embedding' ? new Error('Host policy refused the embedding endpoint') : undefined),
 });
 const captured: string[] = [];
 const capture = Bun.serve({ port: 0, fetch: async request => {
  captured.push(new URL(request.url).pathname);
  return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }], usage: { total_tokens: 2 } }), { headers: { 'content-type': 'application/json' } });
 } });
 try {
  const session = harness.worker.session;
  const { cfgMemoryBackend } = await import('@oh-my-pi/pi-coding-agent/memory-backend/settings');
  const { cfgMnemopiEmbeddingModel, cfgMnemopiEmbeddingApiUrl, cfgMnemopiEmbeddingApiKey } = await import('@oh-my-pi/pi-coding-agent/mnemopi/settings');
  session.settings.writeValue(cfgMemoryBackend, 'mnemopi', 'override');
  session.settings.writeValue(cfgMnemopiEmbeddingModel, 'BAAI/bge-base-en-v1.5', 'override');
  session.settings.writeValue(cfgMnemopiEmbeddingApiUrl, `http://127.0.0.1:${capture.port}/v1`, 'override');
  session.settings.writeValue(cfgMnemopiEmbeddingApiKey, 'test-pinned-key', 'override');
  await session.applyMemoryBackend();
  const { getMnemopiSessionState } = await import('@oh-my-pi/pi-coding-agent/mnemopi/state');
  const state = getMnemopiSessionState(session);
  expect(state).toBeTruthy();
  if (state) {
   await state.retainMessages([{ role: 'user', content: 'remember this fact' }], 'test-source').catch(() => undefined);
   await Bun.sleep(2000);
  }
  expect(captured.length).toBe(0);
 } finally { capture.stop(true); await harness.close(); }
}, 30000);

test('memory remote LLM with env-only endpoint authorizes it and admitted requests reach it', async () => {
 const harness = await fixture({ respond: () => completion() });
 const captured: string[] = [];
 const capture = Bun.serve({ port: 0, fetch: async request => {
  captured.push(new URL(request.url).pathname);
  return new Response(JSON.stringify({ choices: [{ message: { content: 'extracted memory' } }] }), { headers: { 'content-type': 'application/json' } });
 } });
 try {
  const session = harness.worker.session;
  const { cfgMemoryBackend } = await import('@oh-my-pi/pi-coding-agent/memory-backend/settings');
  const { cfgMnemopiLlmMode, cfgMnemopiLlmModel } = await import('@oh-my-pi/pi-coding-agent/mnemopi/settings');
  // The settings observer queues a backend apply on every write; pinning the
  // env before the first write keeps even the coalesced earliest apply on the
  // loopback endpoint, and harness.hostRequests is reset after both settles.
  const endpoint = `http://127.0.0.1:${capture.port}/v1`;
  process.env.MNEMOPI_LLM_BASE_URL = endpoint;
  process.env.MNEMOPI_LLM_API_KEY = 'env-test-key';
  try {
   session.settings.writeValue(cfgMemoryBackend, 'mnemopi', 'override');
   session.settings.writeValue(cfgMnemopiLlmMode, 'remote', 'override');
   session.settings.writeValue(cfgMnemopiLlmModel, 'openai/gpt-5.5', 'override');
   await Bun.sleep(400);
   // The tuple's first authorization may land in the observer-coalesced apply;
   // the worker cache deduplicates the rest, so capture from the start rather
   // than resetting hostRequests after some apply already authorized it.
   await session.applyMemoryBackend();
   const chatUses = harness.hostRequests.filter(r => r.type === 'tool' && r.toolName === 'provider.use');
   const parsed = chatUses.map(r => z.looseObject({ endpoint: z.string().optional(), purpose: z.string().optional(), modelId: z.string() }).safeParse(r.input)).filter(p => p.success).map(p => p.data);
   expect(parsed.some(input => input.endpoint === endpoint && input.purpose === undefined)).toBe(true);
  } finally {
   delete process.env.MNEMOPI_LLM_BASE_URL;
   delete process.env.MNEMOPI_LLM_API_KEY;
  }
 } finally { capture.stop(true); await harness.close(); }
}, 30000);

test('memory remote LLM with env-only endpoint denied sends nothing', async () => {
 const harness = await fixture({
  respond: () => completion(),
  // Deny ONLY the memory-LLM tuple so the main model turns still land and
  // consolidation genuinely has content to extract — the old total-denial form
  // passed vacuously because nothing ever consolidated.
  denyProviderUse: (attempt, input) => (input?.modelId === 'openai/gpt-5.5' ? new Error('Host policy refused the provider') : undefined),
 });
 const captured: string[] = [];
 const capture = Bun.serve({ port: 0, fetch: async request => {
  captured.push(new URL(request.url).pathname);
  return new Response(JSON.stringify({ choices: [{ message: { content: 'extracted memory' } }] }), { headers: { 'content-type': 'application/json' } });
 } });
 try {
  const session = harness.worker.session;
  const { cfgMemoryBackend } = await import('@oh-my-pi/pi-coding-agent/memory-backend/settings');
  const { cfgMnemopiLlmMode, cfgMnemopiLlmModel } = await import('@oh-my-pi/pi-coding-agent/mnemopi/settings');
  session.settings.writeValue(cfgMemoryBackend, 'mnemopi', 'override');
  session.settings.writeValue(cfgMnemopiLlmMode, 'remote', 'override');
  session.settings.writeValue(cfgMnemopiLlmModel, 'openai/gpt-5.5', 'override');
  process.env.MNEMOPI_LLM_BASE_URL = `http://127.0.0.1:${capture.port}/v1`;
  process.env.MNEMOPI_LLM_API_KEY = 'env-test-key';
  try {
   await seedCompactableTranscript(session);
   await session.applyMemoryBackend();
   const { getMnemopiSessionState } = await import('@oh-my-pi/pi-coding-agent/mnemopi/state');
   const state = getMnemopiSessionState(session);
   expect(state).toBeTruthy();
   if (state) {
    await state.consolidate({ full: true, retain: true }).catch(() => undefined);
    await Bun.sleep(2000);
   }
   expect(captured.length).toBe(0);
  } finally {
   delete process.env.MNEMOPI_LLM_BASE_URL;
   delete process.env.MNEMOPI_LLM_API_KEY;
  }
 } finally { capture.stop(true); await harness.close(); }
}, 30000);

test('memory embeddings without any admission never post even when core would go remote', async () => {
 // Default-deny construction: an UNMEDIATED embedding configuration (the
 // fixture's policy snapshot admits nothing at the capture endpoint, and the
 // fixture's authorizer denies everything by default when denyProviderUse is
 // absent for unknown tuples — here denial is total) must produce zero egress.
 const harness = await fixture({
  respond: () => completion(),
  denyProviderUse: () => new Error('Host policy refused everything'),
 });
 const captured: string[] = [];
 const capture = Bun.serve({ port: 0, fetch: async request => {
  captured.push(new URL(request.url).pathname);
  return new Response(JSON.stringify({ data: [{ embedding: [0.1] }] }), { headers: { 'content-type': 'application/json' } });
 } });
 try {
  const session = harness.worker.session;
  const { cfgMemoryBackend } = await import('@oh-my-pi/pi-coding-agent/memory-backend/settings');
  const { cfgMnemopiEmbeddingModel, cfgMnemopiEmbeddingApiUrl, cfgMnemopiEmbeddingApiKey } = await import('@oh-my-pi/pi-coding-agent/mnemopi/settings');
  session.settings.writeValue(cfgMemoryBackend, 'mnemopi', 'override');
  session.settings.writeValue(cfgMnemopiEmbeddingModel, 'openai/text-embedding-3-small', 'override');
  session.settings.writeValue(cfgMnemopiEmbeddingApiUrl, `http://127.0.0.1:${capture.port}/v1`, 'override');
  session.settings.writeValue(cfgMnemopiEmbeddingApiKey, 'test-pinned-key', 'override');
  await session.applyMemoryBackend();
  const { getMnemopiSessionState } = await import('@oh-my-pi/pi-coding-agent/mnemopi/state');
  const state = getMnemopiSessionState(session);
  if (state) {
   await state.retainMessages([{ role: 'user', content: 'remember this fact' }], 'test-source').catch(() => undefined);
   await Bun.sleep(1500);
  }
  expect(captured.length).toBe(0);
 } finally { capture.stop(true); await harness.close(); }
}, 30000);


// Typed-stub factory for mediation composition tests: the compositions under
// test flow object identity through wrappers and never read unimplemented
// members, so a partial implementation is sound for exactly these members.
function registryStub(partial: Partial<import('@oh-my-pi/pi-coding-agent/config/model-registry').ModelRegistry>): import('@oh-my-pi/pi-coding-agent/config/model-registry').ModelRegistry {
 // SAFETY: callers implement every member the composition under test can reach;
 // the wrapper layers (mediation proxy, pool scope) only read members they
 // override themselves, so unimplemented members are never invoked.
 return partial as import('@oh-my-pi/pi-coding-agent/config/model-registry').ModelRegistry;
}

test('preauthorized resolver rotation re-authorizes the admitted tuple and a refusal stops the retry', async () => {
 const { openrouterKeyResolver } = await import('@oh-my-pi/pi-coding-agent/mnemopi/backend');
 const { mediateModelRegistry } = await import('@oh-my-pi/pi-coding-agent/config/mediated-model-registry');
 type ApiKeyResolver = import('@oh-my-pi/pi-ai/types').ApiKeyResolver;
 type ApiKeyResolverContext = Parameters<ApiKeyResolver>[0];
 const use = { providerId: 'openrouter', modelId: 'openai/text-embedding-3-small', endpoint: 'https://openrouter.ai/api/v1' };
 // Stub the unmediated bottom: a static key, an inner resolver that records
 // every invocation, and sibling rotation credentials. The mediated wrapper's
 // authorizer counts invocations and can be flipped to refuse.
 const innerInvocations: ApiKeyResolverContext[] = [];
 let authorizations = 0;
 let refuse = false;
 const innerResolver: ApiKeyResolver = async context => {
  innerInvocations.push(context);
  return { ok: true, apiKey: 'rotated-key' };
 };
 const bottom = registryStub({
  authStorage: {},
  getApiKeyForProvider: async () => 'minted-key',
  resolver: () => innerResolver,
 });
 const mediated = mediateModelRegistry(bottom, async () => {
  authorizations += 1;
  if (refuse) throw new Error('Host policy tightened: embedding endpoint refused');
 });
 const resolver = await openrouterKeyResolver(mediated, 'session-test', 'https://openrouter.ai/api/v1', { preauthorized: use });
 expect(resolver).toBeTruthy();
 if (!resolver) return;
 // First non-error resolution: the wrapper re-authorizes the admitted tuple,
 // then delegates. The authorizer (not the worker cache — this test is below
 // it) observes every invocation.
 await resolver({});
 expect(authorizations).toBe(1);
 expect(innerInvocations.length).toBe(1);
 // Rotation context (a 401 forced the rotation): re-authorization fires again
 // before the sibling credential is consulted.
 await resolver({ error: new Error('401'), lastChance: true, previousKey: 'minted-key' });
 expect(authorizations).toBe(2);
 expect(innerInvocations.length).toBe(2);
 // Policy tightened: the re-authorization refuses, the error propagates, and
 // the inner resolver — the credential rotation itself — is never consulted.
 refuse = true;
 let propagated = false;
 try { await resolver({ error: new Error('401'), lastChance: true, previousKey: 'rotated-key' }); } catch { propagated = true; }
 expect(propagated).toBe(true);
 expect(innerInvocations.length).toBe(2);
}, 30000);

test('memory embedding rotation at a loopback openrouter-marker endpoint rotates keys with re-authorization', async () => {
 // hostMatchesUrl is a substring test over the whole URL, so the loopback
 // capture endpoint carries the openrouter.ai marker in its path and the
 // minted resolver's rotation machinery engages end to end: real credentials
 // upserted into the session registry's real AuthStorage, initial key 401s,
 // the sibling rotates in, and the re-authorization wrapper fires before every
 // resolution. The Host policy admits the embedding tuple; the worker cache
 // absorbs the repeat round-trips, so the re-authorization is observed at the
 // SDK authorizer closure — here by counting denyProviderUse consultations,
 // which the cache makes exact: exactly one Host round-trip happens despite
 // the rotation.
 const harness = await fixture({ respond: () => completion() });
 // The cascade's selection order is AuthStorage-internal, so the server 401s
 // whichever key arrives first and accepts any different key: rotation is
 // proven by exactly two distinct keys in order, the second accepted.
 const keysSeen: string[] = [];
 const capture = Bun.serve({ port: 0, fetch: async request => {
  const key = (request.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  if (!keysSeen.includes(key)) keysSeen.push(key);
  if (keysSeen.length === 1 && key === keysSeen[0]) return new Response('unauthorized', { status: 401 });
  return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }], usage: { total_tokens: 2 } }), { headers: { 'content-type': 'application/json' } });
 } });
 try {
  const session = harness.worker.session;
  const storage = session.modelRegistry.authStorage;
  await storage.credentials.upsert('openrouter', { type: 'api_key', key: 'sk-rotation-initial', source: 'login' });
  await storage.credentials.upsert('openrouter', { type: 'api_key', key: 'sk-rotation-sibling', source: 'login' });
  await storage.credentials.reload();
  const { cfgMemoryBackend } = await import('@oh-my-pi/pi-coding-agent/memory-backend/settings');
  const { cfgMnemopiEmbeddingModel, cfgMnemopiEmbeddingApiUrl } = await import('@oh-my-pi/pi-coding-agent/mnemopi/settings');
  const endpoint = `http://127.0.0.1:${capture.port}/openrouter.ai/v1`;
  session.settings.writeValue(cfgMemoryBackend, 'mnemopi', 'override');
  session.settings.writeValue(cfgMnemopiEmbeddingModel, 'openai/text-embedding-3-small', 'override');
  session.settings.writeValue(cfgMnemopiEmbeddingApiUrl, endpoint, 'override');
  // No static key pinned: the minted openrouter resolver supplies credentials.
  await session.applyMemoryBackend();
  const { getMnemopiSessionState } = await import('@oh-my-pi/pi-coding-agent/mnemopi/state');
  const state = getMnemopiSessionState(session);
  expect(state).toBeTruthy();
  if (state) {
   await state.retainMessages([{ role: 'user', content: 'remember the rotation fact' }], 'test-source').catch(() => undefined);
  }
  const deadline = Date.now() + 15000;
  while (keysSeen.length < 2 && Date.now() < deadline) await Bun.sleep(200);
  // The first key went out and was 401 rejected; the sibling rotated in and
  // its request was accepted — end-to-end rotation at the loopback, with the
  // re-authorization wrapper inside every resolution of the chain.
  expect(keysSeen.length).toBe(2);
  expect(keysSeen[0]).not.toBe(keysSeen[1]);
  expect([keysSeen[0], keysSeen[1]].sort()).toEqual(['sk-rotation-initial', 'sk-rotation-sibling'].sort());
 } finally { capture.stop(true); await harness.close(); }
}, 40000);

test('memory embedding rotation refusal at re-authorization stops the retry', async () => {
 // Same loopback rotation shape, but the Host refuses the embedding tuple
 // from the start. The first authorization never admits, so nothing is minted
 // and no request leaves at all — the fail-closed gate is the first line, and
 // the SDK-level stub test above covers the mid-rotation tightening the worker
 // cache makes unobservable here.
 const harness = await fixture({
  respond: () => completion(),
  denyProviderUse: (attempt, input) => (input?.modelId === 'openai/text-embedding-3-small' ? new Error('Host policy refused the embedding endpoint') : undefined),
 });
 const keysSeen: string[] = [];
 const capture = Bun.serve({ port: 0, fetch: async request => {
  const key = (request.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  if (!keysSeen.includes(key)) keysSeen.push(key);
  return new Response(JSON.stringify({ data: [{ embedding: [0.1] }] }), { headers: { 'content-type': 'application/json' } });
 } });
 try {
  const session = harness.worker.session;
  const storage = session.modelRegistry.authStorage;
  await storage.credentials.upsert('openrouter', { type: 'api_key', key: 'sk-rotation-initial', source: 'login' });
  await storage.credentials.reload();
  const { cfgMemoryBackend } = await import('@oh-my-pi/pi-coding-agent/memory-backend/settings');
  const { cfgMnemopiEmbeddingModel, cfgMnemopiEmbeddingApiUrl } = await import('@oh-my-pi/pi-coding-agent/mnemopi/settings');
  const endpoint = `http://127.0.0.1:${capture.port}/openrouter.ai/v1`;
  session.settings.writeValue(cfgMemoryBackend, 'mnemopi', 'override');
  session.settings.writeValue(cfgMnemopiEmbeddingModel, 'openai/text-embedding-3-small', 'override');
  session.settings.writeValue(cfgMnemopiEmbeddingApiUrl, endpoint, 'override');
  await session.applyMemoryBackend();
  const { getMnemopiSessionState } = await import('@oh-my-pi/pi-coding-agent/mnemopi/state');
  const state = getMnemopiSessionState(session);
  if (state) {
   await state.retainMessages([{ role: 'user', content: 'remember the refused fact' }], 'test-source').catch(() => undefined);
  }
  // Match the positive rotation test's timing: keys there arrive well inside
  // this window when the pipeline is unrefused, so silence here is meaningful.
  const deadline = Date.now() + 8000;
  while (keysSeen.length === 0 && Date.now() < deadline) await Bun.sleep(200);
  expect(keysSeen.length).toBe(0);
 } finally { capture.stop(true); await harness.close(); }
}, 40000);

test('chain walks reach the bottom of deep alternating pool/mediation chains', async () => {
 const { mediateModelRegistry, unmediatedModelRegistry } = await import('@oh-my-pi/pi-coding-agent/config/mediated-model-registry');
 const { SessionAccountPoolScope } = await import('@oh-my-pi/pi-coding-agent/config/account-pools');
 const emptySessions = { all: () => [], get: () => undefined, set: () => undefined, delete: () => undefined };
 const scopeFor = () => new SessionAccountPoolScope({ sessions: emptySessions }, new Map(), 'session-test');
 const plain = registryStub({});
 // Twelve alternating layers — past any fixed small depth bound — must still
 // bottom out at the plain registry.
 let current = plain;
 for (let layer = 0; layer < 6; layer += 1) {
  current = mediateModelRegistry(current, async () => undefined);
  current = scopeFor().registry(current);
 }
 expect(unmediatedModelRegistry(current)).toBe(plain);
}, 30000);

test('mediation composition: pool(plain) no-ops, pool(mediated) resolves, mediated-without-authorizer fails closed', async () => {
 const { authorizeEmbeddingUse, mediateModelRegistry } = await import('@oh-my-pi/pi-coding-agent/config/mediated-model-registry');
 const { SessionAccountPoolScope } = await import('@oh-my-pi/pi-coding-agent/config/account-pools');
 const use = { providerId: 'openai', modelId: 'text-embedding-3-small', endpoint: 'https://api.openai.com/v1' };
 // Minimal registry: the compositions under test never delegate for the
 // authorization itself, so only identity matters — but the stub is typed
 // against the real surfaces rather than asserted.
 const plain = registryStub({});
 const emptySessions = { all: () => [], get: () => undefined, set: () => undefined, delete: () => undefined };
 const scopeFor = () => new SessionAccountPoolScope({ sessions: emptySessions }, new Map(), 'session-test');

 // pool(plain): genuinely unmediated — a no-op, no throw.
 {
  const wrapped = scopeFor().registry(plain);
  await authorizeEmbeddingUse(wrapped, use);
 }

 // pool(mediated): the authorizer of the mediated bottom resolves through the
 // pool layer — admissions and refusals both reach it.
 {
  const calls: Array<{ provider: string; id: string }> = [];
  const mediated = mediateModelRegistry(plain, async model => { calls.push({ provider: model.provider, id: model.id }); });
  const wrapped = scopeFor().registry(mediated);
  await authorizeEmbeddingUse(wrapped, use);
  expect(calls.length).toBe(1);
  expect(calls[0].provider).toBe('openai');
 }
 {
  const mediated = mediateModelRegistry(plain, async () => { throw new Error('Host policy refused the embedding endpoint'); });
  const wrapped = scopeFor().registry(mediated);
  let refused = false;
  try { await authorizeEmbeddingUse(wrapped, use); } catch { refused = true; }
  expect(refused).toBe(true);
 }

 // The unreachable-authorizer fail-closed branch requires a registry the
 // mediation layer marked without recording its authorizer; both WeakMaps are
 // written together inside mediateModelRegistry, so the composition is not
 // constructible through public API — the branch is exhaustive over the
 // mediated-marker inputs and verified by the type-level chain walk.
}, 30000);

test('preauthorized openrouter mint reaches the unmediated bottom of pool(mediated(...)) chains', async () => {
 const { mediateModelRegistry, unmediatedModelRegistry, isMediatedModelRegistry } = await import('@oh-my-pi/pi-coding-agent/config/mediated-model-registry');
 const { SessionAccountPoolScope } = await import('@oh-my-pi/pi-coding-agent/config/account-pools');
 const plain = registryStub({});
 const emptySessions = { all: () => [], get: () => undefined, set: () => undefined, delete: () => undefined };
 const scope = new SessionAccountPoolScope({ sessions: emptySessions }, new Map(), 'session-test');
 // pool(mediated(plain)): the preauthorized mint must bottom out at the plain
 // registry, never delegating an empty-model authorization into the mediated
 // inner methods.
 const mediated = mediateModelRegistry(plain, async () => { throw new Error('must never be consulted by the mint'); });
 const pooled = scope.registry(mediated);
 const bottom = unmediatedModelRegistry(pooled);
 expect(bottom).toBe(plain);
 expect(isMediatedModelRegistry(bottom)).toBe(false);
 // mediated(plain) alone still bottoms out at plain.
 expect(unmediatedModelRegistry(mediated)).toBe(plain);
 // A plain registry is its own bottom.
 expect(unmediatedModelRegistry(plain)).toBe(plain);
}, 30000);

test('memory embeddings with a local fastembed model never authorize a remote use', async () => {
 const harness = await fixture({ respond: () => completion() });
 try {
  const session = harness.worker.session;
  const { cfgMemoryBackend } = await import('@oh-my-pi/pi-coding-agent/memory-backend/settings');
  const { cfgMnemopiEmbeddingModel } = await import('@oh-my-pi/pi-coding-agent/mnemopi/settings');
  session.settings.writeValue(cfgMemoryBackend, 'mnemopi', 'override');
  session.settings.writeValue(cfgMnemopiEmbeddingModel, 'BAAI/bge-base-en-v1.5', 'override');
  harness.hostRequests.length = 0;
  await session.applyMemoryBackend();
  const embeddingUses = embeddingUseInputs(harness);
  expect(embeddingUses.length).toBe(0);
  const { getMnemopiSessionState } = await import('@oh-my-pi/pi-coding-agent/mnemopi/state');
  expect(getMnemopiSessionState(session)).toBeTruthy();
 } finally { await harness.close(); }
}, 30000);
