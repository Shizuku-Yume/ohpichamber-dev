import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { JsonValueSchema, type ApprovalRequest, type JsonObject, type JsonValue, type PromptRequest } from '@openchamber/agent-contract';
import { cfgBashPatterns } from '@oh-my-pi/pi-coding-agent/exec/settings';
import { cfgToolsApprovalMode } from '@oh-my-pi/pi-coding-agent/tools/settings';
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
const ProviderRequestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['system', 'developer', 'user', 'assistant', 'tool']) }).catchall(JsonValueSchema)),
}).catchall(JsonValueSchema);
type ProviderRequest = z.infer<typeof ProviderRequestSchema>;

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

function completion(tool?: { name: string; input: JsonObject; id: string }): Response {
  const chunk = { id: 'native-response', object: 'chat.completion.chunk', created: 1, model: 'native-model', choices: [{ index: 0,
    delta: tool ? { role: 'assistant', tool_calls: [{ index: 0, id: tool.id, type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.input) } }] }
      : { role: 'assistant', content: 'Native operation finished.' }, finish_reason: null }] };
  const finish = { ...chunk, choices: [{ index: 0, delta: {}, finish_reason: tool ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 } };
  return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(finish)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
}

async function fixture({ respond, invoke, machineCommands = [] }: {
  respond: (payload: ProviderRequest, root: string) => Promise<Response> | Response;
  invoke?: (request: HostActionRequest, signal: AbortSignal, root: string) => Promise<JsonValue>;
  machineCommands?: string[];
}) {
  const root = await mkdtemp(join(tmpdir(), 'native-seams-'));
  const home = process.env.HOME;
  process.env.HOME = root;
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  const mcpConfigPath = join(agentDirectory, 'mcp.json');
  await mkdir(cwd);
  await mkdir(agentDirectory);
  const events: ProjectionInput[] = [];
  const requests: ProviderRequest[] = [];
  const grants: string[] = [];
  const pendingApprovals: ApprovalRequest[] = [];
  let approvalWaiter: ((approval: ApprovalRequest) => void) | undefined;
  let journal: SessionJournal | undefined;
  let worker: WorkerSession | undefined;
  let fatal = false;
  const interactions = new InteractionManager();
  const provider = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
    const payload = ProviderRequestSchema.parse(await request.json());
    requests.push(payload);
    return respond(payload, cwd);
  } });
  try {
    worker = await WorkerSession.open({ type: 'bootstrap', rootSessionId, workerGeneration: generation,
      projectId: 'project', workspaceId: 'workspace', agentDirectoryId: 'source', cwd, agentDirectory, mcpConfigPath, sessionsDirectory: join(root, 'sessions') }, inputs => {
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
      const command = z.string().parse(request.input.command);
      if (machineCommands.includes(command)) return;
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
    return { root: cwd, worker, events, requests, grants, interactions, journal, mcpConfigPath,
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
        const messages = payload.messages;
        if (messages.at(-1)?.role === 'tool') return completion();
        return completion({ name: 'bash', id: `native-bash-${++toolCalls}`, input: { command: `printf GRANTED >> '${join(root, 'proof.txt')}'` } });
      } });
      const terminal = Promise.withResolvers<void>();
      const unsubscribe = harness.worker.session.subscribe(event => { if (event.type === 'agent_end' && event.isTerminal !== false && !event.awaitingAsyncWork) terminal.resolve(); });
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
    const harness = await fixture({ machineCommands: [command], respond(payload) {
      const messages = payload.messages;
      return messages.at(-1)?.role === 'tool' ? completion() : completion({ name: 'bash', id: 'pattern-call', input: { command } });
    } });
    const terminal = Promise.withResolvers<void>();
    const unsubscribe = harness.worker.session.subscribe(event => { if (event.type === 'agent_end' && event.isTerminal !== false && !event.awaitingAsyncWork) terminal.resolve(); });
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
        expect(outcome).toMatchObject({ status: 'completed', isError: false,
          output: { content: expect.arrayContaining([{ type: 'text', text: expect.stringContaining('PATTERN') }]) },
        });
      } else {
        expect(outcome).toMatchObject({ status: 'failed', isError: true,
          output: { content: expect.arrayContaining([{ type: 'text', text: expect.stringContaining('blocked by tool policy') }]) },
        });
        expect(outcome.output).not.toMatchObject({ content: expect.arrayContaining([{ type: 'text', text: 'PATTERN' }]) });
      }
      expect(harness.events.filter(input => input.event.type === 'approval.requested')).toHaveLength(0);
      expect(harness.grants).toEqual([]);
      expect(harness.fatal()).toBe(false);
    } finally { unsubscribe(); await harness.close(); }
  }, 30000);
}

test('actual SDK Host tool executes with Host-supplied first-use MCP storage and returns its real file result', async () => {
  let invoked: HostActionRequest | undefined;
  const harness = await fixture({ respond(payload) {
    const messages = payload.messages;
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
    await expect(readFile(harness.mcpConfigPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    cfgToolsApprovalMode.override(harness.worker.session.settings, 'yolo');
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
    await harness.worker.operation({ type: 'prompt', runId: 'streaming-run', request: {
      ...prompt('Keep this initial turn open.'), input: { text: 'Keep this initial turn open.', attachments: [], context: [
        { kind: 'context', text: 'DIRECT_CONTEXT_ENTRY', metadata: {}, instructions: 'DIRECT_ASSOCIATED_INSTRUCTION' },
        { kind: 'instruction', text: 'DIRECT_LATER_INSTRUCTION' },
        { kind: 'synthetic', text: 'DIRECT_SYNTHETIC_ENTRY' },
        { kind: 'context', text: 'DIRECT_LAST_CONTEXT', metadata: {} },
      ] },
    } });
    await firstRequest.promise;
    expectContextOrder(harness.requests[0], [
      'DIRECT_ASSOCIATED_INSTRUCTION', 'DIRECT_CONTEXT_ENTRY', 'DIRECT_LATER_INSTRUCTION', 'DIRECT_SYNTHETIC_ENTRY', 'DIRECT_LAST_CONTEXT',
    ]);
    const attachment = { attachmentId: 'streaming-attachment', name: 'note.txt', mediaType: 'text/plain', size: Buffer.byteLength('ATTACHMENT_MARKER'), uri: 'attachment://streaming-attachment' };
    const path = join(harness.root, 'note.txt');
    await writeFile(path, 'ATTACHMENT_MARKER');
    const steered = await harness.worker.operation({ type: 'steer', request: { ...prompt('STEER_MARKER'), input: { text: 'STEER_MARKER', attachments: [], context: [{ kind: 'instruction', text: 'STEERING_INSTRUCTION' }] } } });
    expect(steered).toMatchObject({ type: 'steer', ack: { sessionId: rootSessionId, runId: 'streaming-run', acceptedAt: expect.any(Number) } });
    const queued = await harness.worker.operation({ type: 'follow-up', request: {
      ...prompt('FOLLOW_UP_MARKER'), input: { text: 'FOLLOW_UP_MARKER', attachments: [attachment], context: [
        { kind: 'context', text: 'FOLLOW_UP_CONTEXT', metadata: { captured: true }, deliveryReceiptId: 'delivery', instructions: 'FOLLOW_UP_ASSOCIATED_INSTRUCTION' },
        { kind: 'instruction', text: 'FOLLOW_UP_LATER_INSTRUCTION' },
        { kind: 'synthetic', text: 'FOLLOW_UP_SYNTHETIC_ENTRY' },
        { kind: 'context', text: 'FOLLOW_UP_LAST_CONTEXT', metadata: {} },
      ] },
    }, attachments: [{ attachmentId: attachment.attachmentId, path }] });
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
    expectContextOrder(harness.requests.find(request => JSON.stringify(request.messages).includes('FOLLOW_UP_CONTEXT')), [
      'FOLLOW_UP_ASSOCIATED_INSTRUCTION', 'FOLLOW_UP_CONTEXT', 'FOLLOW_UP_LATER_INSTRUCTION', 'FOLLOW_UP_SYNTHETIC_ENTRY', 'FOLLOW_UP_LAST_CONTEXT',
    ]);
    expect(harness.fatal()).toBe(false);
  } finally { release.resolve(); unsubscribe(); await harness.close(); }
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
      manager.appendCustomEntry('ohpichamber.canonical.v1', { nativeEntryId: userId, messageId: `user-${index}`, turnId: `turn-${index}`,
        runId: `run-${index}`, userMessageId: `user-${index}`, virtualUser: false, attachments: index === 2 ? [attachment] : [] });
      const assistantId = manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: `Reply ${index}` }], api: 'openai-completions',
        provider: 'native-fixture', model: 'native-model', stopReason: 'stop', timestamp: timestamp++,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
      manager.appendCustomEntry('ohpichamber.canonical.v1', { nativeEntryId: assistantId, messageId: `assistant-${index}`, turnId: `turn-${index}`,
        runId: `run-${index}`, userMessageId: `user-${index}`, virtualUser: false, attachments: [] });
    }
    await manager.flush();
    await writeFile(join(harness.root, 'workspace-proof.txt'), 'Not rolled back');
    const before = harness.worker.seed();
    const treeIds = manager.getEntries().map(entry => entry.id);
    const selectedAssistant = await harness.worker.operation({ type: 'branch', request: { action: 'revert', messageId: 'assistant-1',
      branchId: before.branch.branchId, branchVersion: before.branch.branchVersion } });
    if (selectedAssistant.type !== 'branch') throw new Error('Native assistant selection is required');
    expect(selectedAssistant.seed.messages.map(message => message.messageId)).toEqual(['user-1', 'assistant-1']);
    const fullSelection = await harness.worker.operation({ type: 'branch', request: { action: 'restore',
      branchId: selectedAssistant.result.branch.branchId, branchVersion: selectedAssistant.result.branch.branchVersion } });
    if (fullSelection.type !== 'branch') throw new Error('Native tree restore is required');
    const reverted = await harness.worker.operation({ type: 'branch', request: { action: 'revert', messageId: 'user-2',
      branchId: fullSelection.result.branch.branchId, branchVersion: fullSelection.result.branch.branchVersion } });
    if (reverted.type !== 'branch') throw new Error('Native branch response is required');
    expect(reverted.result).toMatchObject({ sessionId: rootSessionId, branch: { revert: { messageId: 'user-2' } }, draft: { text: 'Prompt 2', attachments: [attachment] } });
    expect(reverted.seed.messages.map(message => message.messageId)).toEqual(['user-1', 'assistant-1']);
    expect(manager.getEntries().map(entry => entry.id)).toEqual(expect.arrayContaining(treeIds));
    expect(await readFile(join(harness.root, 'workspace-proof.txt'), 'utf8')).toBe('Not rolled back');
    const earliest = await harness.worker.operation({ type: 'branch', request: { action: 'revert', messageId: 'user-1',
      branchId: reverted.result.branch.branchId, branchVersion: reverted.result.branch.branchVersion } });
    if (earliest.type !== 'branch') throw new Error('Repeated native undo is required');
    expect(earliest.seed.messages).toEqual([]);
    await harness.worker.close();
    cold = await WorkerSession.open({ type: 'bootstrap', rootSessionId, workerGeneration: 'cold-generation', projectId: 'project',
      workspaceId: 'workspace', agentDirectoryId: 'source', cwd: harness.root, agentDirectory: dirname(harness.mcpConfigPath),
      sessionFile: harness.worker.sessionFile, sessionsDirectory: dirname(harness.worker.sessionFile) }, () => {},
      () => { throw new Error('Branch recovery must not request interaction'); }, () => { throw new Error('Branch recovery must not fail'); },
      async () => {}, async () => { throw new Error('Branch recovery must not invoke Host tools'); }, () => {});
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

test('native branch CAS rejects stale owner/version and redo expires after a new prompt', async () => {
  const harness = await fixture({ respond: () => completion() });
  try {
    const manager = harness.worker.session.sessionManager;
    manager.appendMessage({ role: 'user', content: 'Original prompt', timestamp: Date.now() });
    manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'Original reply' }], api: 'openai-completions', provider: 'native-fixture',
      model: 'native-model', stopReason: 'stop', timestamp: Date.now(),
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
    await manager.flush();
    const before = harness.worker.seed();
    const target = before.messages.find(message => message.role === 'user')!;
    const leaf = manager.getLeafId();
    await expect(harness.worker.operation({ type: 'branch', request: { action: 'revert', messageId: target.messageId,
      branchId: 'another-branch', branchVersion: before.branch.branchVersion } })).rejects.toMatchObject({ code: 'SESSION_BRANCH_CONFLICT' });
    expect(manager.getLeafId()).toBe(leaf);
    const reverted = await harness.worker.operation({ type: 'branch', request: { action: 'revert', messageId: target.messageId,
      branchId: before.branch.branchId, branchVersion: before.branch.branchVersion } });
    if (reverted.type !== 'branch') throw new Error('Native branch response is required');
    await expect(harness.worker.operation({ type: 'branch', request: { action: 'restore', branchId: before.branch.branchId,
      branchVersion: before.branch.branchVersion } })).rejects.toMatchObject({ code: 'SESSION_BRANCH_CONFLICT' });
    const restored = await harness.worker.operation({ type: 'branch', request: { action: 'restore', branchId: reverted.result.branch.branchId,
      branchVersion: reverted.result.branch.branchVersion } });
    if (restored.type !== 'branch') throw new Error('Native restore response is required');
    expect(restored.result.branch.revert).toBeUndefined();
    expect(restored.seed.messages).toEqual(before.messages);
    const again = await harness.worker.operation({ type: 'branch', request: { action: 'revert', messageId: target.messageId,
      branchId: restored.result.branch.branchId, branchVersion: restored.result.branch.branchVersion } });
    if (again.type !== 'branch') throw new Error('Native branch response is required');
    const terminal = Promise.withResolvers<void>();
    const unsubscribe = harness.worker.session.subscribe(event => { if (event.type === 'agent_end' && event.isTerminal !== false && !event.awaitingAsyncWork) terminal.resolve(); });
    try {
      await harness.worker.operation({ type: 'prompt', runId: 'new-branch-run', request: prompt('A new branch prompt') });
      await expect(harness.worker.operation({ type: 'branch', request: { action: 'restore', branchId: again.result.branch.branchId,
        branchVersion: again.result.branch.branchVersion } })).rejects.toMatchObject({ code: 'RUN_ACTIVE' });
      await terminal.promise;
      const history = await harness.worker.operation({ type: 'history', request: { sessionId: rootSessionId } });
      if (history.type !== 'history') throw new Error('Native history response is required');
      expect(history.history.branch.revert).toBeUndefined();
      await expect(harness.worker.operation({ type: 'branch', request: { action: 'restore', branchId: history.history.branch.branchId,
        branchVersion: history.history.branch.branchVersion } })).rejects.toMatchObject({ code: 'SESSION_BRANCH_CONFLICT' });
    } finally { unsubscribe(); }
    expect(harness.fatal()).toBe(false);
  } finally { await harness.close(); }
}, 30000);
