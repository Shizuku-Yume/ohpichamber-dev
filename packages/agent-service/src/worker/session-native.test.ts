import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonObjectSchema, type ApprovalRequest, type JsonObject, type JsonValue, type PromptRequest } from '@openchamber/agent-contract';
import { resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import { InteractionManager } from '../interaction/manager.ts';
import { SessionJournal } from '../projection/journal.ts';
import type { ProjectionInput } from '../projection/protocol.ts';
import type { HostActionRequest } from '../native-policy-protocol.ts';
import { NativeApprovalRequired } from './policy.ts';
import { WorkerSession } from './session.ts';

beforeEach(resetSettingsForTest);
afterEach(resetSettingsForTest);
const rootSessionId = 'native-root';
const generation = 'native-generation';
const options = { providerId: 'native-fixture', modelId: 'native-model', agentId: null, variant: null, reasoningEffort: null };
const prompt = (text: string): PromptRequest => ({ input: { text, context: [], attachments: [] }, options });

function completion(tool?: { name: string; input: JsonObject; id: string }): Response {
  const chunk = { id: 'native-response', object: 'chat.completion.chunk', created: 1, model: 'native-model', choices: [{ index: 0,
    delta: tool ? { role: 'assistant', tool_calls: [{ index: 0, id: tool.id, type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.input) } }] }
      : { role: 'assistant', content: 'Native operation finished.' }, finish_reason: null }] };
  const finish = { ...chunk, choices: [{ index: 0, delta: {}, finish_reason: tool ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 } };
  return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(finish)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
}

async function fixture({ respond, invoke, machineCommands = [] }: {
  respond: (payload: JsonObject, root: string) => Promise<Response> | Response;
  invoke?: (request: HostActionRequest, signal: AbortSignal, root: string) => Promise<JsonValue>;
  machineCommands?: string[];
}) {
  const root = await mkdtemp(join(tmpdir(), 'native-seams-'));
  const home = process.env.HOME;
  process.env.HOME = root;
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd);
  await mkdir(agentDirectory);
  const events: ProjectionInput[] = [];
  const requests: JsonObject[] = [];
  const grants: string[] = [];
  const pendingApprovals: ApprovalRequest[] = [];
  let approvalWaiter: ((approval: ApprovalRequest) => void) | undefined;
  let journal: SessionJournal | undefined;
  let worker: WorkerSession | undefined;
  let fatal = false;
  const interactions = new InteractionManager();
  const provider = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
    const payload = JsonObjectSchema.parse(await request.json());
    requests.push(payload);
    return respond(payload, cwd);
  } });
  try {
    worker = await WorkerSession.open({ type: 'bootstrap', rootSessionId, workerGeneration: generation,
      projectId: 'project', workspaceId: 'workspace', agentDirectoryId: 'source', cwd, agentDirectory, sessionsDirectory: join(root, 'sessions') }, inputs => {
      events.push(...inputs);
      journal?.append(inputs);
    }, interaction => {
      interactions.onRequest(rootSessionId, generation, interaction);
      if (interaction.kind !== 'approval') throw new Error('This native seam must not request a question');
      const approval = interactions.approvals(rootSessionId).find(record => record.approvalId === interaction.approvalId)!;
      if (approvalWaiter) { const waiter = approvalWaiter; approvalWaiter = undefined; waiter(approval); }
      else pendingApprovals.push(approval);
    }, () => { fatal = true; }, async request => {
      if (request.type === 'tool' && ['openchamber', 'web', 'memory', 'notify'].includes(request.toolName)) throw new Error('Host tools must use their domain capability owner, not generic tool grants');
      if (request.type !== 'tool' || request.toolName !== 'bash') return;
      if (typeof request.input.command === 'string' && machineCommands.includes(request.input.command)) return;
      const grant = request.approvalId && request.toolCallId
        ? interactions.consumeApprovalGrant(rootSessionId, generation, request.approvalId, request.toolCallId, request.toolName, request.input) : undefined;
      if (!grant) throw new NativeApprovalRequired();
      grants.push(grant.approvalId);
    }, async (request, signal) => {
      if (!invoke) throw new Error('Host action was not part of this scenario');
      return invoke(request, signal, cwd);
    }, () => {});
    journal = new SessionJournal({ sessionId: rootSessionId, rootSessionId, projectId: 'project', workspaceId: 'workspace', displayPath: '.' }, worker.seed());
    const sessionWorker = worker;
    interactions.openSession(rootSessionId, journal.runtime().epoch, generation, 'workspace', async operation => { await sessionWorker.operation(operation); }, input => { events.push(input); journal!.append([input]); });
    await worker.operation({ type: 'catalog', revision: '1', operation: { type: 'catalog.provider.configure', request: { expectedRevision: '0', configuration: {
      providerId: 'native-fixture', name: 'Native fixture', endpoint: `http://127.0.0.1:${provider.port}/v1`, protocol: 'chat-completions', credentialRef: null,
    } } } });
    await worker.operation({ type: 'catalog', revision: '2', operation: { type: 'catalog.model.configure', request: { expectedRevision: '1', model: {
      modelId: 'native-model', provider: 'native-fixture', name: 'Native model', modalities: ['text'], contextWindow: 65536, maxOutputTokens: 128,
      reasoningEffortSupported: false, reasoningOptions: [], variants: [], toolsSupported: true, enabled: true, pricing: null,
    } } } });
    return { root: cwd, worker, events, requests, grants, interactions, journal,
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
        await sessionWorker.close();
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

for (const approvalMode of ['always-ask', 'yolo'] as const) {
  for (const decision of ['approve', 'reject'] as const) {
    test(`actual SDK Bash ${approvalMode} waits for source-bound ${decision} before execution`, async () => {
      let toolCalls = 0;
      const harness = await fixture({ respond(payload, root) {
        const messages = payload.messages as JsonObject[];
        if (messages.at(-1)?.role === 'tool') return completion();
        return completion({ name: 'bash', id: `native-bash-${++toolCalls}`, input: { command: `printf GRANTED >> '${join(root, 'proof.txt')}'` } });
      } });
      const terminal = Promise.withResolvers<void>();
      const unsubscribe = harness.worker.session.subscribe(event => { if (event.type === 'agent_end' && event.isTerminal !== false && !event.awaitingAsyncWork) terminal.resolve(); });
      try {
        harness.worker.session.settings.set('tools.approvalMode', approvalMode);
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
    const machineCommands: string[] = [];
    const harness = await fixture({ machineCommands, respond(payload, root) {
      const messages = payload.messages as JsonObject[];
      return messages.at(-1)?.role === 'tool' ? completion() : completion({ name: 'bash', id: 'pattern-call', input: { command: `printf PATTERN >> '${join(root, 'pattern.txt')}'` } });
    } });
    const command = `printf PATTERN >> '${join(harness.root, 'pattern.txt')}'`;
    machineCommands.push(command);
    const terminal = Promise.withResolvers<void>();
    const unsubscribe = harness.worker.session.subscribe(event => { if (event.type === 'agent_end' && event.isTerminal !== false && !event.awaitingAsyncWork) terminal.resolve(); });
    try {
      harness.worker.session.settings.set('tools.approvalMode', 'always-ask');
      harness.worker.session.settings.set('bash.patterns', [{ match: command, approval: decision }]);
      await harness.worker.operation({ type: 'prompt', runId: 'pattern-run', request: prompt('Use the configured native bash pattern.') });
      await terminal.promise;
      if (decision === 'allow') expect(await readFile(join(harness.root, 'pattern.txt'), 'utf8')).toBe('PATTERN');
      else await expect(readFile(join(harness.root, 'pattern.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      expect(harness.events.filter(input => input.event.type === 'approval.requested')).toHaveLength(0);
      expect(harness.grants).toEqual([]);
      expect(harness.fatal()).toBe(false);
    } finally { unsubscribe(); await harness.close(); }
  }, 30000);
}

test('actual SDK Host tool reaches the captured capability owner and returns its real file result', async () => {
  let invoked: HostActionRequest | undefined;
  const harness = await fixture({ respond(payload) {
    const messages = payload.messages as JsonObject[];
    return messages.at(-1)?.role === 'tool' ? completion() : completion({ name: 'memory', id: 'host-memory', input: { action: 'memory.save', input: { key: 'proof', content: 'HOST_MEMORY_WRITTEN' } } });
  }, async invoke(request, signal, root) {
    signal.throwIfAborted();
    invoked = request;
    await writeFile(join(root, 'memory.txt'), String(request.input.content));
    const stored = await readFile(join(root, 'memory.txt'), 'utf8');
    return { stored, bytes: Buffer.byteLength(stored) };
  } });
  const terminal = Promise.withResolvers<void>();
  const unsubscribe = harness.worker.session.subscribe(event => { if (event.type === 'agent_end' && event.isTerminal !== false && !event.awaitingAsyncWork) terminal.resolve(); });
  try {
    harness.worker.session.settings.set('tools.approvalMode', 'yolo');
    expect(harness.worker.session.getAllToolInfos().map(tool => tool.name)).toEqual(expect.arrayContaining(['openchamber', 'web', 'memory', 'notify']));
    await harness.worker.operation({ type: 'prompt', runId: 'host-run', request: prompt('Store the marker with the memory tool.') });
    await terminal.promise;
    expect(invoked).toEqual({ sessionId: rootSessionId, toolName: 'memory', action: 'memory.save', input: { key: 'proof', content: 'HOST_MEMORY_WRITTEN' } });
    expect(await readFile(join(harness.root, 'memory.txt'), 'utf8')).toBe('HOST_MEMORY_WRITTEN');
    expect(JSON.stringify(harness.requests)).toContain('HOST_MEMORY_WRITTEN');
    expect(harness.events.some(input => input.event.type === 'tool.completed' && input.event.toolCallId === 'host-memory' && input.event.status === 'completed')).toBe(true);
    expect(harness.fatal()).toBe(false);
  } finally { unsubscribe(); await harness.close(); }
}, 30000);

test('actual SDK steer/follow-up admission retains queued identity, captured context and attachment metadata', async () => {
  const firstRequest = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let requestCount = 0;
  const harness = await fixture({ async respond() {
    if (++requestCount === 1) { firstRequest.resolve(); await release.promise; }
    return completion();
  } });
  const followedUp = Promise.withResolvers<void>();
  const finished = Promise.withResolvers<void>();
  let followUpId: string | undefined;
  let seen = false;
  const unsubscribe = harness.worker.session.subscribe(event => {
    if (event.type === 'message_start' && event.message.role === 'user' && JSON.stringify(event.message.content).includes('FOLLOW_UP_MARKER')) { seen = true; followedUp.resolve(); }
    if (seen && event.type === 'agent_end' && event.isTerminal !== false && !event.awaitingAsyncWork) finished.resolve();
  });
  try {
    await expect(harness.worker.operation({ type: 'steer', request: prompt('idle steer') })).rejects.toMatchObject({ code: 'RUN_NOT_FOUND', status: 404 });
    await expect(harness.worker.operation({ type: 'follow-up', request: prompt('idle follow-up') })).rejects.toMatchObject({ code: 'RUN_NOT_FOUND', status: 404 });
    expect(harness.requests).toHaveLength(0);
    await harness.worker.operation({ type: 'prompt', runId: 'streaming-run', request: prompt('Keep this initial turn open.') });
    await firstRequest.promise;
    const attachment = { attachmentId: 'streaming-attachment', name: 'note.txt', mediaType: 'text/plain', size: Buffer.byteLength('ATTACHMENT_MARKER'), uri: 'attachment://streaming-attachment' };
    const path = join(harness.root, 'note.txt');
    await writeFile(path, 'ATTACHMENT_MARKER');
    const steered = await harness.worker.operation({ type: 'steer', request: { ...prompt('STEER_MARKER'), input: { text: 'STEER_MARKER', attachments: [], context: [{ kind: 'instruction', text: 'STEERING_INSTRUCTION' }] } } });
    expect(steered).toMatchObject({ type: 'steer', ack: { sessionId: rootSessionId, runId: 'streaming-run', acceptedAt: expect.any(Number) } });
    const queued = await harness.worker.operation({ type: 'follow-up', request: { ...prompt('FOLLOW_UP_MARKER'), input: { text: 'FOLLOW_UP_MARKER', attachments: [attachment], context: [{ kind: 'context', text: 'FOLLOW_UP_CONTEXT', metadata: { captured: true }, deliveryReceiptId: 'delivery' }] } }, attachments: [{ attachmentId: attachment.attachmentId, path }] });
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
    expect(JSON.stringify(harness.requests)).toContain('STEERING_INSTRUCTION');
    expect(JSON.stringify(harness.requests)).toContain('FOLLOW_UP_CONTEXT');
    expect(harness.fatal()).toBe(false);
  } finally { release.resolve(); unsubscribe(); await harness.close(); }
}, 30000);
