import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import * as C from '@openchamber/agent-contract';
import { CanonicalApiError, CanonicalClient } from './canonicalClient';
import { configureRuntimeUrlResolver, getRuntimeUrlResolver, setRuntimeUrlResolver, type RuntimeUrlResolver } from '../lib/runtime-url';

const sessionId = 'session_expected';
const workspaceId = 'workspace_expected';
const epoch = 'epoch_expected';
const generation = 'worker_expected';
const client = new CanonicalClient();
const runtimeSession: C.RuntimeSession = {
  sessionId, rootSessionId: 'root_expected', projectId: 'project_expected', workspaceId, displayPath: '.',
  epoch, headSequence: '0', createdAt: 1, updatedAt: 1, runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
};
const snapshot = (session = runtimeSession): C.SessionSnapshot => ({
  session, cursor: `${session.epoch}:${session.headSequence}`, activeRun: null,
  branch: { branchId: 'branch_expected', branchVersion: '1', leafMessageId: null },
  window: { firstTurnId: null, lastTurnId: null, firstMessageId: null, lastMessageId: null, hasEarlier: false },
  turns: [], messages: [], approvals: [], questions: [], requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' },
});
const prompt: C.RunCreateRequest = {
  input: { text: 'hello', context: [], attachments: [] },
  options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null },
};
const worker: C.CatalogWorkerIdentity = { rootSessionId: runtimeSession.rootSessionId, workspaceId, workerGeneration: generation };
const agent: C.Agent = { agentId: 'agent/a', name: 'Agent', description: '', model: null, allowedTools: [] };
const model: C.Model = {
  modelId: 'model_expected', provider: 'provider_expected', name: 'Model', modalities: ['text'], contextWindow: 1000,
  maxOutputTokens: 100, reasoningEffortSupported: false, reasoningOptions: [], variants: [], pricing: null,
};
const completion: C.CompletionRequest = {
  workspaceId, completionId: 'completion_expected', selection: { providerId: model.provider, modelId: model.modelId },
  prompt: 'hello', format: { kind: 'text' }, overflow: 'reject', variant: null, reasoningEffort: null,
};
const job: C.ShellJob = {
  jobId: 'job_expected', sessionId, epoch, workerGeneration: generation, workspaceId, projectId: runtimeSession.projectId,
  command: 'echo hello', background: false, startedAt: 1, outputCursor: '0', status: 'running',
};
const skills: C.SkillsCatalogState = {
  worker, agentDirectoryId: 'agent_directory_expected', runtimeStatus: 'ready', persistedSources: { workspace: '1', agent: '1' },
  appliedSources: { workspace: '1', agent: '1' }, catalogRevision: '1', skills: [],
};
const mcp: C.MCPCatalogRead = {
  configuration: { workspaceId, persistedRevision: '1', config: { servers: [] } },
  workerCatalog: { worker, runtimeStatus: 'ready', appliedRevision: '1', catalogRevision: '1', activeServers: [], tools: [] },
};

let handler: (request: IncomingMessage, response: ServerResponse) => void;
let server: Server;
let previousResolver: RuntimeUrlResolver;
let calls: string[];
const json = (response: ServerResponse, payload: C.JsonValue) => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(payload)); };
const respondWith = (payload: C.JsonValue) => { handler = (_request, response) => json(response, payload); };

beforeEach(async () => {
  calls = [];
  handler = (_request, response) => { response.writeHead(404); response.end(); };
  server = createServer((request, response) => { calls.push(`${request.method} ${request.url}`); handler(request, response); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  // SAFETY: the completed listen callback above binds a TCP port on loopback, so address() is a TCP address.
  const address = server.address() as AddressInfo;
  previousResolver = getRuntimeUrlResolver();
  configureRuntimeUrlResolver({ apiBaseUrl: `http://127.0.0.1:${address.port}` });
});
afterEach(async () => {
  setRuntimeUrlResolver(previousResolver);
  const closed = new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  server.closeAllConnections();
  await closed;
});

describe('CanonicalClient real HTTP scope boundary', () => {
  test('usage reads preserve canonical filters, explicit time bounds and honest nullable metrics', async () => {
    const input: C.UsageQuery = { from: 1, to: 1000, timezone: 'America/New_York', workspaceId, projectId: 'project_expected' };
    const stats: C.UsageStats = {
      range: { from: 1, to: 1000 }, sessions: 1, subagents: 0, prompts: 1, steps: 1,
      tokens: { input: 2, output: 3, reasoning: null, cacheRead: 0, cacheWrite: 0, total: 5 }, cost: 0,
      tools: { mode: 'none' }, activeDays: 1, streak: 1, activity: [], providers: [], models: [], partial: true,
      errors: { session_bad: 'SESSION_READ_FAILED' },
    };
    respondWith(stats);
    expect(await client.getUsageStats(input)).toEqual(stats);
    const url = new URL(calls[0].slice(4), 'http://localhost');
    expect(url.pathname).toBe('/api/agent/v1/usage');
    expect(Object.fromEntries(url.searchParams)).toEqual({ from: '1', to: '1000', timezone: 'America/New_York', workspaceId, projectId: 'project_expected' });
    const tools: C.UsageToolsResponse = {
      totals: { calls: 1, succeeded: 0, failed: 0, unfinished: 1 },
      usage: [{ name: 'read', calls: 1, succeeded: 0, failed: 0, unfinished: 1, durationP50: null }], partial: false
    };
    respondWith(tools);
    expect(await client.getUsageTools(input)).toEqual(tools);
    expect(calls[1]).toContain('GET /api/agent/v1/usage/tools?');
    respondWith({ ...stats, tokens: { ...stats.tokens, reasoning: 'unknown' } });
    await expect(client.getUsageStats(input)).rejects.toThrow();
  });

  test('usage requests propagate aborts and reject malformed queries before transport', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(client.getUsageStats({ to: 1000, timezone: 'UTC' }, { signal: controller.signal })).rejects.toThrow();
    expect(calls).toHaveLength(0);
    expect(() => client.getUsageStats({ from: 10, to: 1, timezone: 'UTC' })).toThrow();
    expect(calls).toHaveLength(0);
  });
  test('validates canonical Agent Service readiness', async () => {
    respondWith({ ready: true, engine: 'omp', version: '1.0.0' });
    expect(await client.checkReady()).toBe(true);
    expect(calls).toEqual(['GET /api/agent/v1/ready']);

    respondWith({ ready: true });
    expect(await client.checkReady()).toBe(false);
  });
  test('reads exact attachment bytes with explicit source workspace scope', async () => {
    handler = (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      response.end(Buffer.from([0, 127, 255]));
    };
    const bytes = await client.readAttachment('workspace/source', 'attachment/a');
    expect(new Uint8Array(await bytes.arrayBuffer())).toEqual(new Uint8Array([0, 127, 255]));
    expect(calls).toEqual(['GET /api/agent/v1/attachments/attachment%2Fa?workspaceId=workspace%2Fsource']);
  });

  test('attachment owner failures preserve native ProblemDetails', async () => {
    const problem = { type: 'urn:ohpichamber:problem:UNAUTHORIZED', title: 'Attachment operation failed', status: 403, detail: 'Attachment scope is not authorized', code: 'UNAUTHORIZED', retryable: false };
    handler = (_request, response) => {
      response.writeHead(403, { 'Content-Type': 'application/problem+json' });
      response.end(JSON.stringify(problem));
    };
    try {
      await client.readAttachment(workspaceId, 'attachment');
      throw new Error('Expected owner rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(CanonicalApiError);
      if (!(error instanceof CanonicalApiError)) throw error;
      expect(error.problem).toEqual(problem);
    }
    expect(calls).toHaveLength(1);
  });
  test('rejects other-session snapshots, history, metadata, queue and deletion receipts', async () => {
    for (const invoke of [() => client.getSession(sessionId), () => client.getSnapshot(sessionId)]) {
      respondWith(snapshot({ ...runtimeSession, sessionId: 'session_other' }));
      await expect(invoke()).rejects.toThrow();
    }
    respondWith({ sessionId: 'session_other', branch: snapshot().branch, turns: [], messages: [], nextCursor: null });
    await expect(client.getHistory(sessionId)).rejects.toThrow();
    respondWith({ sessionId: 'session_other', revision: '0', metadata: null });
    await expect(client.getSessionMetadata(sessionId)).rejects.toThrow();
    await expect(client.patchSessionMetadata(sessionId, { changes: { notes: 'Note' } })).rejects.toThrow();
    respondWith({ ...runtimeSession, sessionId: 'session_other' });
    await expect(client.renameSession(sessionId, runtimeSession.workspaceId, 'Title')).rejects.toThrow();
    respondWith({ sessionId: 'session_other', revision: '0', items: [] });
    await expect(client.getQueue(sessionId)).rejects.toThrow();
    await expect(client.appendQueue(sessionId, { expectedRevision: '0', content: 'hello', request: prompt })).rejects.toThrow();
    await expect(client.reorderQueue(sessionId, { expectedRevision: '0', queueItemIds: [] })).rejects.toThrow();
    await expect(client.deleteQueueItem(sessionId, 'item_expected', { expectedRevision: '0', queueItemId: 'item_expected' })).rejects.toThrow();
    respondWith({ queue: { sessionId: 'session_other', revision: '1', items: [] }, draft: null, text: 'taken', content: 'taken', createdAt: 1 });
    await expect(client.takeQueueItem(sessionId, 'item_expected', { expectedRevision: '0', queueItemId: 'item_expected' })).rejects.toThrow();
    respondWith({ sessionId: 'session_other', deletedSessionIds: ['session_other'] });
    await expect(client.deleteSession(sessionId)).rejects.toThrow();
  });

  test('takeQueueItem round-trips the preserved draft and validates request identity before transport', async () => {
    const draft: C.QueueOriginalDraft = {
      content: 'edit me', text: 'edit me',
      attachments: [{
        attachmentId: 'attachment/1', name: 'note.txt', mediaType: 'text/plain', size: 4,
        uri: 'attachment://attachment/1', agentPath: '/workspace/note.txt',
        original: { mimeType: 'text/plain', dataUrl: 'data:text/plain;base64,bm90ZQ==', saveOnSend: true },
      }],
      context: [{ kind: 'context', text: 'chip text', metadata: { openchamberContext: { kind: 'repository-issue' } } }],
      agentMention: { agentId: 'agent/1' },
      options: { providerId: 'provider/1', modelId: 'model/1', agentId: null, variant: null, reasoningEffort: null },
      goal: { objective: 'finish', tokenBudget: 4000 },
    };
    const result: C.QueueTakeResult = {
      queue: { sessionId, revision: '2', items: [] },
      draft,
      text: 'edit me',
      content: 'edit me',
      createdAt: 1000,
    };
    respondWith(result);
    const taken = await client.takeQueueItem(sessionId, 'item/1', { expectedRevision: '1', queueItemId: 'item/1' });
    expect(taken).toEqual(result);
    expect(calls).toEqual([`POST /api/agent/v1/sessions/${sessionId}/queue/${encodeURIComponent('item/1')}/take`]);
    const count = calls.length;
    expect(() => client.takeQueueItem(sessionId, 'item/1', { expectedRevision: '1', queueItemId: 'item/other' })).toThrow('does not match the route');
    expect(calls).toHaveLength(count);
    respondWith({ queue: { sessionId, revision: '2', items: [] }, draft: null, text: 'legacy', content: 'legacy', createdAt: 1000 });
    const partial = await client.takeQueueItem(sessionId, 'item/legacy', { expectedRevision: '1', queueItemId: 'item/legacy' });
    expect(partial.draft).toBeNull();
    respondWith({ queue: { sessionId, revision: '2', items: [] }, draft: { ...draft, attachments: [{ attachmentId: 'attachment/1' }] }, text: 'x', content: 'x', createdAt: 1 });
    await expect(client.takeQueueItem(sessionId, 'item/1', { expectedRevision: '1', queueItemId: 'item/1' })).rejects.toThrow();
  });

  test('rejects session creation, fork and archive receipts outside the requested ownership', async () => {
    const other = { ...runtimeSession, sessionId: 'session_child', workspaceId: 'workspace_other', metadata: null, metadataRevision: '0', archiveRevision: '0' };
    respondWith({ session: other });
    await expect(client.createSession({ projectId: runtimeSession.projectId, workspaceId, options: prompt.options })).rejects.toThrow();
    await expect(client.forkSession(runtimeSession, { mode: 'full' })).rejects.toThrow();
    respondWith({ archived: [{ id: 'session_other', archivedAt: 2 }], failedIds: [] });
    await expect(client.archiveSessions([sessionId])).rejects.toThrow();
    respondWith({ restored: [], failedIds: ['session_other'] });
    await expect(client.unarchiveSessions([sessionId])).rejects.toThrow();
  });

  test('rejects out-of-workspace discovery and catalogs but accepts authoritative empty scope', async () => {
    respondWith({ items: [{ ...runtimeSession, workspaceId: 'workspace_other', metadata: null, metadataRevision: '0', archiveRevision: '0' }], errors: {} });
    await expect(client.listSessions(workspaceId)).rejects.toThrow();
    respondWith({ items: [{ workspaceId, projectId: 'project_other', name: 'Workspace' }], errors: {} });
    await expect(client.listWorkspaces(runtimeSession.projectId)).rejects.toThrow();
    for (const [field, invoke] of [
      ['models', () => client.getModels(workspaceId)], ['providers', () => client.getProviders(workspaceId)], ['agents', () => client.getAgents(workspaceId)],
    ] as const) {
      if (field === 'models') {
        respondWith({ workspaceId: 'workspace_other', revision: '0', models: [], imageModels: [], defaults: { model: null, thinkingLevel: null }, planRoleAvailable: false });
        await expect(invoke()).rejects.toThrow();
        respondWith({ workspaceId, revision: '0', models: [], imageModels: [], defaults: { model: null, thinkingLevel: null }, planRoleAvailable: false });
      } else {
        respondWith({ workspaceId: 'workspace_other', revision: '0', [field]: [] });
        await expect(invoke()).rejects.toThrow();
        respondWith({ workspaceId, revision: '0', [field]: [] });
      }
      expect((await invoke()).workspaceId).toBe(workspaceId);
    }
    respondWith({ items: [], errors: {} });
    expect(await client.listSessions(workspaceId)).toEqual({ items: [], errors: {} });
  });

  test('settings reads and writes verify workspace ownership and the next revision', async () => {
    const settingsState = { workspaceId, revision: '7', totalCount: 0, settings: [] };
    respondWith(settingsState);
    expect((await client.getOmpSettings(workspaceId)).revision).toBe('7');
    expect(calls.at(-1)).toBe(`GET /api/agent/v1/workspaces/${workspaceId}/settings`);
    respondWith({ ...settingsState, revision: '8' });
    await expect(client.updateOmpSettings(workspaceId, { expectedRevision: '7', changes: [{ id: 'compaction.thresholdPercent', value: 60 }] })).resolves.toMatchObject({ revision: '8' });
    expect(calls.at(-1)).toBe(`PUT /api/agent/v1/workspaces/${workspaceId}/settings`);
    respondWith({ ...settingsState, revision: '9' });
    await expect(client.updateOmpSettings(workspaceId, { expectedRevision: '7', changes: [{ id: 'compaction.thresholdPercent', value: 60 }] })).rejects.toThrow();
    respondWith({ ...settingsState, workspaceId: 'workspace_other' });
    await expect(client.getOmpSettings(workspaceId)).rejects.toThrow();
    await expect(client.updateOmpSettings(workspaceId, { expectedRevision: '7', changes: [{ id: 'compaction.thresholdPercent', value: 60 }] })).rejects.toThrow();
  });

  test('rejects unrelated run, steering and follow-up receipts', async () => {
    respondWith({ run: { runId: 'run_other', sessionId, status: 'cancelled', createdAt: 1, finishedAt: 2 } });
    await expect(client.abortRun(sessionId, 'run_expected')).rejects.toThrow();
    await expect(client.abortSession(sessionId, 'run_expected')).rejects.toThrow();
    respondWith({ run: { runId: 'run_expected', sessionId: 'session_other', status: 'running', createdAt: 1 } });
    await expect(client.createRun(sessionId, prompt)).rejects.toThrow();
    respondWith({ sessionId: 'session_other', runId: 'run_expected', acceptedAt: 1 });
    await expect(client.steer(sessionId, prompt)).rejects.toThrow();
    respondWith({ sessionId: 'session_other', followUpId: 'followup_expected', acceptedAt: 1 });
    await expect(client.followUp(sessionId, prompt)).rejects.toThrow();
  });
  test('sends compact instructions through the canonical session control contract', async () => {
    respondWith({ type: 'compact', compactionId: 'compact_1', tokensBefore: 4096, completedAt: 1 });
    await expect(client.compactSession(sessionId, 'Keep key details.')).resolves.toMatchObject({ type: 'compact', tokensBefore: 4096 });
    expect(calls.at(-1)).toBe(`POST /api/agent/v1/sessions/${sessionId}/control`);
    respondWith({ type: 'compact.abort', aborted: true });
    await expect(client.abortCompaction(sessionId)).resolves.toEqual({ type: 'compact.abort', aborted: true });
    respondWith({ type: 'command', output: '' });
    await expect(client.abortCompaction(sessionId)).rejects.toThrow();
  });
  test('sends mode.set through canonical session control and validates the authoritative mode ack', async () => {
    respondWith({ type: 'mode.set', mode: { kind: 'plan', status: 'active', planReference: 'local://plans/session-1.md' } });
    await expect(client.setMode(sessionId, 'plan')).resolves.toMatchObject({ type: 'mode.set', mode: { kind: 'plan', status: 'active' } });
    expect(calls.at(-1)).toBe(`POST /api/agent/v1/sessions/${sessionId}/control`);
    respondWith({ type: 'mode.set', mode: { kind: 'vibe' } });
    await expect(client.setMode(sessionId, 'vibe')).resolves.toEqual({ type: 'mode.set', mode: { kind: 'vibe' } });
  });
  test('sends goal controls and validates native goal state over canonical transport', async () => {
    const mode = { kind: 'goal', status: 'active', objective: 'Finish the task', tokenBudget: 5000, tokensUsed: 42 };
    respondWith({ type: 'goal', mode });
    await expect(client.goal(sessionId, { op: 'create', objective: mode.objective, tokenBudget: mode.tokenBudget })).resolves.toEqual({ type: 'goal', mode });
    expect(calls.at(-1)).toBe(`POST /api/agent/v1/sessions/${sessionId}/control`);
    respondWith({ type: 'goal', mode: { ...mode, status: 'blocked' } });
    await expect(client.goal(sessionId, { op: 'pause' })).rejects.toThrow();
    respondWith({ type: 'goal', mode: { kind: 'main' } });
    await expect(client.goal(sessionId, { op: 'drop' })).resolves.toEqual({ type: 'goal', mode: { kind: 'main' } });
    const count = calls.length;
    expect(() => client.goal(sessionId, { op: 'create', objective: '  ' })).toThrow();
    expect(calls).toHaveLength(count);
  });

  test('rejects unrelated interaction identity or generation', async () => {
    const reply: C.ApprovalReply = { version: '1', epoch, workerGeneration: generation, decision: 'approve' };
    const approval: C.ApprovalRequest = {
      approvalId: 'approval_other', sessionId, turnId: 'turn', toolCallId: 'tool', toolName: 'bash', actionType: 'bash_command',
      commandSummary: '', details: {}, version: '2', epoch, workerGeneration: generation, status: 'approved',
      requestedAt: 1, resolvedAt: 2, resolution: { decision: 'approve' },
    };
    respondWith(approval);
    await expect(client.respondApproval(sessionId, 'approval_expected', reply)).rejects.toThrow();
    respondWith({ ...approval, approvalId: 'approval_expected', workerGeneration: 'worker_other' });
    await expect(client.respondApproval(sessionId, 'approval_expected', reply)).rejects.toThrow();
    respondWith({ questionId: 'question_other', sessionId, turnId: 'turn', prompt: '?', version: '2', epoch, workerGeneration: generation, status: 'cancelled', requestedAt: 1, resolvedAt: 2 });
    await expect(client.respondQuestion(sessionId, 'question_expected', { version: '1', epoch, workerGeneration: generation, action: 'cancel' })).rejects.toThrow();
  });

  test('rejects mismatched mutation result identities', async () => {
    respondWith({ revision: '1', agentId: 'agent_other', agent: null });
    await expect(client.updateAgent(workspaceId, { expectedRevision: '0', agent })).rejects.toThrow();
    await expect(client.createAgent(workspaceId, { expectedRevision: '0', agent })).rejects.toThrow();
    await expect(client.deleteAgent(workspaceId, { expectedRevision: '0', agentId: agent.agentId })).rejects.toThrow();
    respondWith({ revision: '1', providerId: 'provider_other', provider: null });
    await expect(client.deleteProvider(workspaceId, 'provider_expected', { expectedRevision: '0', providerId: 'provider_expected' })).rejects.toThrow();
    await expect(client.configureProvider(workspaceId, 'provider_expected', { expectedRevision: '0', configuration: { providerId: 'provider_expected', name: 'Provider', endpoint: 'https://provider.example', protocol: 'responses', credentialRef: null } })).rejects.toThrow();
    respondWith({ revision: '1', selection: { providerId: model.provider, modelId: 'model_other' }, model: null });
    await expect(client.configureModel(workspaceId, model.provider, model.modelId, { expectedRevision: '0', model })).rejects.toThrow();
    await expect(client.deleteModel(workspaceId, model.provider, model.modelId, { expectedRevision: '0', selection: completion.selection })).rejects.toThrow();
    respondWith({ revision: '1', providerId: 'provider_other', auth: { status: 'missing' } });
    await expect(client.writeProviderCredential(workspaceId, 'provider_expected', { expectedRevision: '0', providerId: 'provider_expected', credential: { method: 'api-key', apiKey: 'secret' } })).rejects.toThrow();
    await expect(client.deleteProviderCredential(workspaceId, 'provider_expected', { expectedRevision: '0', providerId: 'provider_expected', credentialRef: 'credential' })).rejects.toThrow();
  });

  test('rejects path/body scope conflicts before any network dispatch', async () => {
    const operations = [
      () => client.configureProvider(workspaceId, 'provider_expected', { expectedRevision: '0', configuration: { providerId: 'provider_other', name: 'Other', endpoint: 'https://provider.example', protocol: 'responses', credentialRef: null } }),
      () => client.deleteProvider(workspaceId, 'provider_expected', { expectedRevision: '0', providerId: 'provider_other' }),
      () => client.configureModel(workspaceId, model.provider, model.modelId, { expectedRevision: '0', model: { ...model, provider: 'provider_other' } }),
      () => client.deleteModel(workspaceId, model.provider, model.modelId, { expectedRevision: '0', selection: { ...completion.selection, modelId: 'model_other' } }),
      () => client.writeProviderCredential(workspaceId, model.provider, { expectedRevision: '0', providerId: 'provider_other', credential: { method: 'api-key', apiKey: 'secret' } }),
      () => client.deleteProviderCredential(workspaceId, model.provider, { expectedRevision: '0', providerId: 'provider_other', credentialRef: 'credential' }),
      () => client.deleteQueueItem(sessionId, 'item_expected', { expectedRevision: '0', queueItemId: 'item_other' }),
      () => client.stopShell(sessionId, { job: { jobId: job.jobId, sessionId: 'session_other', epoch, workerGeneration: generation } }),
      () => client.complete(workspaceId, { ...completion, workspaceId: 'workspace_other' }),
      () => client.cancelCompletion(workspaceId, completion.completionId, { completionId: 'completion_other' }),
    ];
    for (const operation of operations) await expect(Promise.resolve().then(async () => { await operation(); })).rejects.toThrow('does not match the route');
    expect(calls).toEqual([]);
  });

  test('rejects other Shell scope, output cursor and job generation', async () => {
    respondWith({ scope: { kind: 'workspace', workspaceId: 'workspace_other' }, epoch, revision: '0', running: [], ended: [], recovery: { priorEpochs: 'invalidated' } });
    await expect(client.getShellSnapshot({ kind: 'workspace', workspaceId })).rejects.toThrow();
    respondWith({ scope: { kind: 'session', sessionId }, epoch, revision: '1', running: [{ ...job, sessionId: 'session_other' }], ended: [], recovery: { priorEpochs: 'invalidated' } });
    await expect(client.getShellSnapshot({ kind: 'session', sessionId })).rejects.toThrow();
    respondWith({ ...job, sessionId: 'session_other' });
    await expect(client.startShell(sessionId, { command: 'echo hello', background: false })).rejects.toThrow();
    const identity = { jobId: job.jobId, epoch, workerGeneration: generation };
    respondWith({ job: { ...identity, sessionId, workerGeneration: 'worker_other' }, requestedCursor: '0', startCursor: '0', cursor: '0', skippedBytes: '0', output: '', ended: false });
    await expect(client.getShellOutput(sessionId, identity, '0', 100)).rejects.toThrow();
    respondWith({ job: { ...identity, sessionId }, requestedCursor: '1', startCursor: '1', cursor: '1', skippedBytes: '0', output: '', ended: false });
    await expect(client.getShellOutput(sessionId, identity, '0', 100)).rejects.toThrow();
    respondWith({ job: { ...job, jobId: 'job_other', status: 'ended', endedAt: 2, termination: { reason: 'stopped', exitCode: null } } });
    await expect(client.stopShell(sessionId, { job: { ...identity, sessionId } })).rejects.toThrow();
  });

  test('propagates an abort signal to shell output and stop before dispatch', async () => {
    const identity = { jobId: job.jobId, epoch, workerGeneration: generation };
    const controller = new AbortController();
    controller.abort();
    respondWith({ job: identity, requestedCursor: '0', startCursor: '0', cursor: '0', skippedBytes: '0', output: '', ended: false });
    await expect(client.getShellOutput(sessionId, identity, '0', 100, controller.signal)).rejects.toThrow();
    expect(calls).toHaveLength(0);
    respondWith({ job: { ...job, status: 'ended', endedAt: 2, termination: { reason: 'stopped', exitCode: null } } });
    await expect(client.stopShell(sessionId, { job: { ...identity, sessionId } }, controller.signal)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  test('manages a workspace MCP catalog without creating or reading any session', async () => {
    const configuration = mcp.configuration;
    respondWith(configuration);
    expect(await client.getWorkspaceMcpConfig(workspaceId)).toEqual(configuration);
    respondWith({ kind: 'mcp', status: 'no-active-workers', outcome: 'applied', configuration, workers: [] });
    expect((await client.configureWorkspaceMcp(workspaceId, { expectedPersistedRevision: '0', config: configuration.config })).status).toBe('no-active-workers');
    expect((await client.applyWorkspaceMcp(workspaceId, { persistedRevision: '1' })).workers).toEqual([]);
    respondWith({ workspaceId, serverId: 'server_expected', persistedRevision: '1', status: 'connected', toolCount: 2 });
    const probe = await client.testWorkspaceMcpServer(workspaceId, 'server_expected', { persistedRevision: '1' });
    expect(probe).toEqual({ workspaceId, serverId: 'server_expected', persistedRevision: '1', status: 'connected', toolCount: 2 });
    expect(calls).toEqual([
      `GET /api/agent/v1/workspaces/${workspaceId}/mcp/config`,
      `PUT /api/agent/v1/workspaces/${workspaceId}/mcp/config`,
      `POST /api/agent/v1/workspaces/${workspaceId}/mcp/apply`,
      `POST /api/agent/v1/workspaces/${workspaceId}/mcp/servers/server_expected/test`,
    ]);
  });

  test('rejects MCP workspace, server, revision and OAuth generation substitutions', async () => {
    respondWith({ ...mcp.configuration, workspaceId: 'workspace_other' });
    await expect(client.getWorkspaceMcpConfig(workspaceId)).rejects.toThrow();
    const outcome = { workspaceId, serverId: 'server_expected', persistedRevision: '1', status: 'connected', toolCount: 1 };
    for (const change of [{ workspaceId: 'workspace_other' }, { serverId: 'server_other' }, { persistedRevision: '2' }]) {
      respondWith({ ...outcome, ...change });
      await expect(client.testWorkspaceMcpServer(workspaceId, 'server_expected', { persistedRevision: '1' })).rejects.toThrow();
    }
    respondWith({ serverId: 'server_expected', worker: { ...worker, workerGeneration: 'worker_other' }, persistedRevision: '1', status: 'unauthenticated', authenticated: false });
    await expect(client.submitWorkspaceMcpOAuth(workspaceId, 'server_expected', { action: 'disconnect', persistedRevision: '1', workerGeneration: generation })).rejects.toThrow();
  });

  test('rejects replacement OAuth flows and binds credential writes to the selected workspace revision', async () => {
    respondWith({ serverId: 'server_expected', worker, persistedRevision: '1', status: 'pending', authenticated: false, pendingFlow: { flowId: 'flow_other', authorizationUrl: 'https://example.com/authorize' } });
    await expect(client.submitWorkspaceMcpOAuth(workspaceId, 'server_expected', { action: 'cancel', persistedRevision: '1', workerGeneration: generation, flowId: 'flow_expected' })).rejects.toThrow();
    for (const change of [{ workspaceId: 'workspace_other' }, { serverId: 'server_other' }, { persistedRevision: '2' }]) {
      respondWith({ workspaceId, serverId: 'server_expected', persistedRevision: '1', credentialRef: 'credential_ref', ...change });
      await expect(client.writeWorkspaceMcpCredential(workspaceId, 'server_expected', { persistedRevision: '1', value: 'private' })).rejects.toThrow();
    }
  });

  test('preserves workspace reconnect no-worker probe failure instead of claiming runtime application', async () => {
    const result = { workspaceId, serverId: 'server_expected', persistedRevision: '1', status: 'no-active-workers', workers: [], probe: { workspaceId, serverId: 'server_expected', persistedRevision: '1', status: 'failed', error: { code: 'MCP_APPLY_FAILED', detail: 'Connection failed', retryable: true } } };
    respondWith(result);
    expect(await client.reconnectWorkspaceMcpServer(workspaceId, 'server_expected', { persistedRevision: '1' })).toEqual(result);
  });

  test('rejects secret-bearing MCP credential responses rather than exposing values', async () => {
    respondWith({ workspaceId, serverId: 'server_expected', persistedRevision: '1', credentialRef: 'credential_ref', value: 'private' });
    await expect(client.writeWorkspaceMcpCredential(workspaceId, 'server_expected', { persistedRevision: '1', value: 'private' })).rejects.toThrow();
  });

  test('binds MCP and skills to root worker scope, not the addressed child session', async () => {
    respondWith(mcp);
    expect((await client.getMcpCatalog(runtimeSession)).workerCatalog.worker.rootSessionId).toBe(runtimeSession.rootSessionId);
    expect(calls).toHaveLength(1);
    respondWith({ ...mcp, workerCatalog: { ...mcp.workerCatalog, worker: { ...worker, rootSessionId: 'root_other' } } });
    await expect(client.getMcpCatalog(runtimeSession)).rejects.toThrow();
    respondWith({ ...skills, worker: { ...worker, workspaceId: 'workspace_other' } });
    await expect(client.getSkillsCatalog(runtimeSession)).rejects.toThrow();
    respondWith({ serverId: 'server_other', worker, persistedRevision: '1', status: 'unauthenticated', authenticated: false });
    await expect(client.getMcpOAuth(runtimeSession, 'server_expected')).rejects.toThrow();
    respondWith({ serverId: 'server_expected', worker: { ...worker, workerGeneration: 'worker_other' }, persistedRevision: '1', status: 'unauthenticated', authenticated: false });
    await expect(client.submitMcpOAuth(runtimeSession, 'server_expected', { action: 'disconnect', persistedRevision: '1', workerGeneration: generation })).rejects.toThrow();
    respondWith({ worker, skillId: 'skill_other', catalogRevision: '1', message: 'Expanded' });
    await expect(client.expandSkill(runtimeSession, { skillId: 'skill_expected', catalogRevision: '1', workerGeneration: generation, arguments: '' })).rejects.toThrow();
    respondWith({ ...mcp, workerCatalog: { ...mcp.workerCatalog, worker: { ...worker, workerGeneration: 'worker_other' } } });
    await expect(client.reconnectMcp(runtimeSession, 'server_expected', { persistedRevision: '1', expectedCatalogRevision: '1', workerGeneration: generation })).rejects.toThrow();
  });

  test('rejects wrong MCP apply workspace and selected skill source scope without extra authority reads', async () => {
    respondWith({ kind: 'mcp', status: 'no-active-workers', outcome: 'applied', configuration: { workspaceId: 'workspace_other', persistedRevision: '1', config: { servers: [] } }, workers: [] });
    await expect(client.configureMcp(runtimeSession, { expectedPersistedRevision: '0', config: { servers: [] } })).rejects.toThrow();
    await expect(client.applyMcp(runtimeSession, { persistedRevision: '1' })).rejects.toThrow();
    respondWith({ kind: 'skills', status: 'no-active-workers', scope: { kind: 'agent', agentDirectoryId: 'agent_directory_other' }, sourceRevision: '1', workers: [] });
    await expect(client.applySkills({ ...runtimeSession, agentDirectoryId: skills.agentDirectoryId }, { scope: 'agent', sourceRevision: '1' })).rejects.toThrow();
    expect(calls).toHaveLength(3);
  });

  test('rejects completion identity and model-selection substitutions', async () => {
    for (const result of [
      { completionId: 'completion_other', selection: completion.selection },
      { completionId: completion.completionId, selection: { ...completion.selection, providerId: 'provider_other' } },
      { completionId: completion.completionId, selection: { ...completion.selection, modelId: 'model_other' } },
    ]) {
      respondWith({ ...result, status: 'completed', output: { kind: 'text', text: 'Output' }, finishReason: 'complete', usage: null });
      await expect(client.complete(workspaceId, completion)).rejects.toThrow();
    }
    respondWith({ completionId: 'completion_other', status: 'cancelled' });
    await expect(client.cancelCompletion(workspaceId, completion.completionId)).rejects.toThrow();
  });
});

type StreamObservation = { events: C.CanonicalEvent[]; invalidations: C.StreamInvalidated[]; errors: unknown[] };
const statusEvent: C.CanonicalEvent = { type: 'session.status', sessionId, epoch, sequence: '1', timestamp: 1, runtimeStatus: 'idle', activeRunId: null };
const invalidation: C.StreamInvalidated = { type: 'stream.invalidated', sessionId, epoch, reason: 'EPOCH_CHANGED' };
const frame = (event: C.CanonicalEvent | C.StreamInvalidated, newline = '\n') => `event: ${event.type}${newline}data: ${JSON.stringify(event)}${newline}${newline}`;

// The server leaves the response open: only cancellation by the real client can release it.
async function observeStream(chunks: string[], options: { abort?: boolean; throwOnEvent?: boolean; throwOnInvalidated?: boolean; contentType?: string } = {}): Promise<StreamObservation> {
  let closed!: () => void;
  const disconnected = new Promise<void>(resolve => { closed = resolve; });
  let opened!: () => void;
  const connected = new Promise<void>(resolve => { opened = resolve; });
  handler = (_request, response) => {
    response.on('close', closed);
    response.writeHead(200, { 'Content-Type': options.contentType ?? 'text/event-stream' });
    response.flushHeaders();
    opened();
    let index = 0;
    const send = () => {
      if (response.destroyed || index === chunks.length) return;
      response.write(chunks[index++], send);
    };
    send();
  };
  const result: StreamObservation = { events: [], invalidations: [], errors: [] };
  const stop = client.subscribeSessionEvents(sessionId, `${epoch}:0`, event => {
    result.events.push(event);
    if (options.throwOnEvent) throw new Error('Consumer failed');
  }, event => { result.invalidations.push(event); if (options.throwOnInvalidated) throw new Error('Invalidation consumer failed'); }, error => { result.errors.push(error); });
  try {
    await connected;
    if (options.abort) stop();
    await disconnected;
    if (!options.abort && result.invalidations.length === 0 && result.errors.length === 0) throw new Error('Client did not terminate the stream');
    return result;
  } finally { stop(); }
}

describe('CanonicalClient real SSE protocol boundary', () => {
  test('rejects another session before either event callback and disconnects exactly once', async () => {
    for (const event of [{ ...statusEvent, sessionId: 'session_other' }, { ...invalidation, sessionId: 'session_other' }]) {
      const result = await observeStream([frame(event), frame(invalidation)]);
      expect(result.events).toEqual([]);
      expect(result.invalidations).toEqual([]);
      expect(result.errors).toHaveLength(1);
    }
  });

  test('accepts LF, CRLF and CR framing including a split CRLF newline', async () => {
    for (const newline of ['\n', '\r\n', '\r']) {
      const result = await observeStream([frame(statusEvent, newline), frame(invalidation, newline)]);
      expect(result.events).toEqual([statusEvent]);
      expect(result.invalidations).toEqual([invalidation]);
      expect(result.errors).toEqual([]);
    }
    const result = await observeStream(['event: session.status\r', '\ndata: ' + JSON.stringify(statusEvent) + '\r', '\n\r', '\n' + frame(invalidation, '\r\n')]);
    expect(result.events).toEqual([statusEvent]);
    expect(result.invalidations).toEqual([invalidation]);
    expect(result.errors).toEqual([]);
  });

  test('resets event names for empty frames and ignores comments while joining data lines', async () => {
    const result = await observeStream([
      'event: stream.invalidated\n\n: heartbeat\n\n',
      'data: {\ndata: "type":"session.status","sessionId":"session_expected","epoch":"epoch_expected",\ndata: "sequence":"1","timestamp":1,"runtimeStatus":"idle","activeRunId":null}\n\n',
      frame(invalidation),
    ]);
    expect(result.events).toEqual([statusEvent]);
    expect(result.invalidations).toEqual([invalidation]);
    expect(result.errors).toEqual([]);
  });

  test('parse and consumer failures cancel the open response and publish one owner failure', async () => {
    const invalid = await observeStream(['data: not-json\n\n', frame(statusEvent)]);
    expect(invalid.events).toEqual([]);
    expect(invalid.errors).toHaveLength(1);
    const consumer = await observeStream([frame(statusEvent), frame(statusEvent)], { throwOnEvent: true });
    expect(consumer.events).toEqual([statusEvent]);
    expect(consumer.errors).toHaveLength(1);
    expect(consumer.invalidations).toEqual([]);
  });

  test('rejects nested wrong-session entities and protocol event-name/content-type conflicts', async () => {
    const event: C.CanonicalEvent = { type: 'queue.updated', sessionId, epoch, sequence: '1', timestamp: 1, queue: { sessionId: 'session_other', revision: '0', items: [] } };
    const nested = await observeStream([frame(event)]);
    expect(nested.events).toEqual([]);
    expect(nested.errors).toHaveLength(1);
    const name = await observeStream(['event: stream.invalidated\ndata: ' + JSON.stringify(statusEvent) + '\n\n']);
    expect(name.events).toEqual([]);
    expect(name.invalidations).toEqual([]);
    expect(name.errors).toHaveLength(1);
    const content = await observeStream([frame(statusEvent)], { contentType: 'application/json' });
    expect(content.events).toEqual([]);
    expect(content.errors).toHaveLength(1);
    const consumer = await observeStream([frame(invalidation)], { throwOnInvalidated: true });
    expect(consumer.invalidations).toEqual([invalidation]);
    expect(consumer.errors).toHaveLength(1);
  });

  test('intentional abort cancels an idle open response without an owner error', async () => {
    const result = await observeStream([], { abort: true });
    expect(result).toEqual({ events: [], invalidations: [], errors: [] });
  });

  test('EOF after a partial frame reports one failure and never publishes incomplete JSON', async () => {
    handler = (_request, response) => { response.writeHead(200, { 'Content-Type': 'text/event-stream' }); response.end('data: {"type":"session.status"'); };
    const events: C.CanonicalEvent[] = [];
    const errors: unknown[] = [];
    await new Promise<void>((resolve, reject) => {
      const stop = client.subscribeSessionEvents(sessionId, `${epoch}:0`, event => events.push(event), () => reject(new Error('Unexpected invalidation')), error => { errors.push(error); stop(); resolve(); });
    });
    expect(events).toEqual([]);
    expect(errors).toHaveLength(1);
  });
});
describe('CanonicalClient native web search boundary', () => {
  test('validates workspace and exact CAS revision, propagates aborts, and keeps credentials write-only', async () => {
    const provider: C.WebSearchProviderEntry = {
      providerId: 'web/tavily', name: 'Tavily', configured: true, requiresCredential: true,
      isSelfHosted: false, credentialWritable: true, credentialConfigured: true
    };
    const state = (revision: string): C.WebSearchConfigState => ({
      workspaceId, revision, enabled: true, selectedProviderId: 'web/tavily',
      fallbackProviderIds: [], timeoutSeconds: 60, providers: [provider]
    });
    const mutation = (revision: string): C.WebSearchMutationResult => ({ state: state(revision), status: 'applied', persistence: 'persisted', workers: [] });
    let seenBody: unknown;
    respondWith(state('1'));
    expect(await client.getWebSearch(workspaceId)).toEqual(state('1'));
    handler = async (request, response) => {
      let text = '';
      for await (const chunk of request) text += chunk.toString();
      seenBody = text ? JSON.parse(text) : undefined;
      json(response, mutation(request.method === 'PUT' ? '2' : '3'));
    };
    await expect(client.updateWebSearch(workspaceId, { expectedRevision: '1', enabled: false })).resolves.toEqual(mutation('2'));
    expect(calls.at(-1)).toBe('PUT /api/agent/v1/workspaces/workspace_expected/web-search');
    expect(seenBody).toEqual({ expectedRevision: '1', enabled: false });
    respondWith(mutation('3'));
    await expect(client.updateWebSearch(workspaceId, { expectedRevision: '1', enabled: false })).rejects.toThrow();
    const secret = 'private-web-search-key';
    handler = async (request, response) => {
      let text = '';
      for await (const chunk of request) text += chunk.toString();
      seenBody = text ? JSON.parse(text) : undefined;
      json(response, mutation('2'));
    };
    const written = await client.writeWebSearchCredential(workspaceId, { expectedRevision: '1', providerId: 'web/tavily', apiKey: secret });
    expect(written.state.revision).toBe('2');
    expect(seenBody).toEqual({ expectedRevision: '1', providerId: 'web/tavily', apiKey: secret });
    expect(JSON.stringify(written)).not.toContain(secret);
    const controller = new AbortController();
    controller.abort();
    const priorCalls = calls.length;
    await expect(client.getWebSearch(workspaceId, { signal: controller.signal })).rejects.toThrow();
    expect(calls).toHaveLength(priorCalls);
  });
});
